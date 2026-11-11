import { Component, AfterViewInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, viewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import type { IScannerControls } from '@zxing/browser';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { TanaEnt, TanaGoods, TanaService } from './tana.service';

/** このスマホで入れた記録（画面の下に出す） */
interface Done { at: string; gcode: string; gtext: string; suu: number; loc: string; sequ?: number; draft: boolean }

/** スマホに覚えておく設定 */
const KEY = 'MWSYS_TANASCAN';

/**
 * 棚卸（倉庫のスマホ）。商品のバーコード（JAN）か商品コードを読むと、商品名・棚番・システム在庫が出る。数を入れて登録する。
 *   ・すぐ登録: その日の棚卸数として、すぐ在庫に反映する（随時の棚卸。同じ日の同じ商品は上書き）
 *   ・一斉棚卸: 場所（棚）ごとに数えた数を下書きに足す。棚卸集計の画面で合計し、在庫と比べてから一括確定する
 * カメラは https でだけ使える。Bluetooth のバーコードリーダー（キーボード入力）でも読める
 */
@Component({
  selector: 'app-tanascan',
  templateUrl: './tanascan.component.html',
  styleUrls: ['./../frmship/pick.component.scss', './tanascan.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIcon]
})
export class TanascanComponent implements AfterViewInit, OnDestroy {
  private usrsrv = inject(UserService);
  strsrv = inject(StoreService);
  private tanasrv = inject(TanaService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  readonly suuInput = viewChild<ElementRef<HTMLInputElement>>('suuInput');

  scode = '';
  day = this.usrsrv.formatDate(new Date());
  /** direct = すぐ登録、draft = 一斉棚卸（下書き） */
  kind: 'direct' | 'draft' = 'draft';
  /** 数えている場所（一斉棚卸） */
  loc = '';
  goods: TanaGoods | null = null;
  stock: number | null = null;
  /** 一斉棚卸: この商品のこの日の下書き */
  ents: TanaEnt[] = [];
  /** すぐ登録: この日に登録済みの棚卸数 */
  done: number | null = null;
  suu: number | null = null;
  manual = '';
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  busy = false;
  scanning = false;
  history: Done[] = [];

  private controls?: IScannerControls;
  private stream?: MediaStream;
  private zxing = Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  private lastText = '';
  private lastAt = 0;
  private audio?: AudioContext;

  constructor() {
    this.title.setTitle('棚卸（スマホ）(MWSystem)');
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (s) {
        this.scode = s.scode ?? '';
        this.kind = s.kind == 'direct' ? 'direct' : 'draft';
        this.loc = s.loc ?? '';
      }
    } catch {
      // 覚えていなければ初期値
    }
    if (!this.scode) {
      this.scode = this.usrsrv.staff?.scode ?? '';
    }
  }

  ngAfterViewInit(): void {
    // OnPush の画面なので、倉庫の一覧を読み終わったら画面を更新する（しないとプルダウンが空のまま）。
    // 画面ができてから読む（できる前に画面を更新しない）
    this.strsrv.getStore().then(() => this.cdRef.detectChanges()).catch(e => console.log('error store', e));
  }

  ngOnDestroy(): void {
    this.stop();
    this.audio?.close();
  }

  remember() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ scode: this.scode, kind: this.kind, loc: this.loc }));
    } catch {
      // 保存できなくても使える
    }
    if (this.goods) {
      this.open(this.goods.gcode);
    }
  }

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  get entSum(): number {
    return this.ents.reduce((a, e) => a + e.suu, 0);
  }

  /** 登録すると在庫がいくつ変わるか（すぐ登録: 入れた数 − 在庫、一斉棚卸: 下書きの合計＋入れた数 − 在庫） */
  get diff(): number | null {
    if (this.stock == null || this.suu == null || String(this.suu) === '') {
      return null;
    }
    return (this.kind == 'draft' ? this.entSum : 0) + Number(this.suu) - this.stock;
  }

  async start() {
    if (this.controls) {
      return;
    }
    const video = this.video()?.nativeElement;
    if (!video) {
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.show('この画面ではカメラを使えません（https で開いてください）。バーコードリーダーか手入力を使ってください', 'ng');
      return;
    }
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await this.zxing;
      const hints = new Map<unknown, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]]
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<never, never>, { delayBetweenScanAttempts: 150 });
      this.stream = stream;
      this.scanning = true;
      this.controls = await reader.decodeFromStream(stream, video, result => {
        if (result) {
          this.onCode(result.getText());
        }
      });
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      this.scanning = false;
      this.show((e as DOMException)?.name == 'NotAllowedError'
        ? 'カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください'
        : 'カメラを起動できませんでした：' + (e as Error).message, 'ng');
      console.log('error tanascan camera', e);
    }
    this.cdRef.detectChanges();
  }

  stop() {
    this.controls?.stop();
    this.controls = undefined;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
    this.scanning = false;
  }

  onManual() {
    const t = this.manual.trim();
    this.manual = '';
    if (t) {
      this.onCode(t, true);
    }
  }

  onCode(text: string, typed = false) {
    const now = Date.now();
    if (!typed && text == this.lastText && now - this.lastAt < 2000) {
      return;
    }
    this.lastText = text;
    this.lastAt = now;
    // 読んだらカメラを止めて、数を入れてもらう
    this.stop();
    this.open(text.trim());
  }

  /** 商品を出す（商品名・棚番・システム在庫・下書きや登録済みの数） */
  async open(code: string) {
    if (!this.scode || !this.day) {
      this.show('倉庫と日付を選んでください', 'ng');
      this.cdRef.detectChanges();
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const g = await this.tanasrv.findGoods(code);
      if (!g) {
        this.goods = null;
        this.show('商品が見つかりません（' + code + '）', 'ng');
      } else {
        const [st, ents, recs] = await Promise.all([
          this.tanasrv.stocks(this.scode, this.day, [g.gcode]),
          this.kind == 'draft' ? this.tanasrv.entries(this.scode, this.day, g.gcode) : Promise.resolve([]),
          this.kind == 'direct' ? this.tanasrv.records(this.scode, this.day, [g.gcode]) : Promise.resolve(new Map())
        ]);
        this.goods = g;
        this.stock = st.get(g.gcode) ?? 0;
        this.ents = ents;
        this.done = recs.get(g.gcode)?.tana ?? null;
        this.suu = null;
        this.show(g.gcode + ' を読みました。数を入れてください', 'ok');
        setTimeout(() => this.suuInput()?.nativeElement.focus());
      }
    } catch (e) {
      this.show('読めませんでした：' + (e as Error).message, 'ng');
      console.log('error tanascan open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 登録（すぐ登録: 棚卸数として登録、一斉棚卸: 下書きに足す） */
  async save() {
    const g = this.goods;
    const n = Number(this.suu);
    if (!g || this.suu == null || String(this.suu) === '' || !Number.isInteger(n) || n < 0) {
      this.show('数は 0 以上の整数で入れてください', 'ng');
      return;
    }
    if (this.kind == 'draft' && !this.loc.trim()) {
      this.show('数えている場所（棚）を入れてください', 'ng');
      return;
    }
    const d = this.diff;
    if (this.kind == 'direct' && d != null && d != 0 && !confirm('在庫（' + this.stock + '）と ' + (d > 0 ? '+' : '') + d + ' 違います。' + n + ' で登録しますか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      if (this.kind == 'direct') {
        await this.tanasrv.saveTana(this.scode, this.day, [{ gcode: g.gcode, tana: n }]);
      } else {
        await this.tanasrv.addEntry(this.scode, this.day, g.gcode, this.loc, n);
      }
      const t = new Date();
      this.history.unshift({
        at: String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'),
        gcode: g.gcode, gtext: g.gtext, suu: n, loc: this.kind == 'draft' ? this.loc : '', draft: this.kind == 'draft'
      });
      this.history = this.history.slice(0, 30);
      this.show(this.kind == 'draft'
        ? g.gcode + '　' + this.loc + ' に ' + n + ' を足しました（この日の合計 ' + (this.entSum + n) + '）'
        : g.gcode + ' の棚卸を ' + n + ' で登録しました', 'ok');
      this.goods = null;
      this.suu = null;
      this.ents = [];
    } catch (e) {
      this.show('登録できませんでした：' + (e as Error).message, 'ng');
      console.log('error tanascan save', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 下書きの 1 件を消す（数え間違い） */
  async delEnt(e: TanaEnt) {
    if (!confirm((e.loc ?? '') + ' の ' + e.suu + ' を消しますか？')) {
      return;
    }
    try {
      await this.tanasrv.deleteEntry(e.sequ);
      this.ents = this.ents.filter(x => x.sequ != e.sequ);
      this.show('消しました', 'info');
    } catch (err) {
      this.show('消せませんでした：' + (err as Error).message, 'ng');
    }
    this.cdRef.detectChanges();
  }

  private show(text: string, type: 'ok' | 'ng' | 'info') {
    this.msg = text;
    this.msgType = type;
    if (type != 'info') {
      this.beep(type == 'ok');
      navigator.vibrate?.(type == 'ok' ? 80 : [200, 100, 200]);
    }
  }

  private beep(ok: boolean) {
    try {
      this.audio ??= new AudioContext();
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.frequency.value = ok ? 1800 : 300;
      g.gain.value = 0.2;
      o.connect(g).connect(this.audio.destination);
      o.start();
      o.stop(this.audio.currentTime + (ok ? 0.08 : 0.4));
    } catch {
      // 音が出せない環境では鳴らさない
    }
  }
}
