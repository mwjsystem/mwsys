import { Component, AfterViewInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, viewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import type { IScannerControls } from '@zxing/browser';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { GzaiRef, StGds, StockService } from './../services/stock.service';
import { TanaGoods, TanaService } from './../frmtana/tana.service';

/** 倉庫ごとの在庫（1 行） */
interface StockRow {
  scode: string;
  name: string;
  /** 在庫数（セット品は受注可能数だけ） */
  stock: number | null;
  /** 受注可能数 = 在庫 − 引当済 − キープ済 − 加工依頼中 */
  pable: number;
  hikat: number;
  keepd: number;
  kakod: number;
  /** この端末の倉庫 */
  mine: boolean;
}

/** 読んだ商品の記録（画面の下に出して、押すともう一度出す） */
interface Read { gcode: string; gtext: string }

/** スマホに覚えておく設定 */
const KEY = 'MWSYS_STOCKSCAN';

/**
 * 現在庫確認（スマホ）。商品のバーコード（JAN）か商品コードを読むと、倉庫ごとの在庫・受注可能数・入荷予定が出る。
 * カメラは https でだけ使える。Bluetooth のバーコードリーダー（キーボード入力）や手入力でも読める。
 * 在庫の計算は PC の現在庫確認と同じ StockService を使い、キャッシュを使わずに今の数を読む
 */
@Component({
  selector: 'app-stockscan',
  templateUrl: './stockscan.component.html',
  styleUrls: ['./../frmship/pick.component.scss', './stockscan.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIcon, DatePipe]
})
export class StockscanComponent implements AfterViewInit, OnDestroy {
  usrsrv = inject(UserService);
  private strsrv = inject(StoreService);
  private stcsrv = inject(StockService);
  private tanasrv = inject(TanaService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  goods: TanaGoods | null = null;
  rows: StockRow[] = [];
  /** 入荷予定（在庫品だけ） */
  plan: StGds | null = null;
  /** 在庫の無い倉庫も出す */
  showAll = false;
  manual = '';
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  busy = false;
  scanning = false;
  history: Read[] = [];

  private myScode = '';
  private controls?: IScannerControls;
  private stream?: MediaStream;
  private zxing = Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  private lastText = '';
  private lastAt = 0;
  private audio?: AudioContext;

  constructor() {
    this.title.setTitle('在庫確認（スマホ）(MWSystem)');
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      this.showAll = s?.showAll == true;
    } catch {
      // 覚えていなければ初期値
    }
    this.myScode = this.usrsrv.staff?.scode ?? '';
  }

  ngAfterViewInit(): void {
    // OnPush の画面なので、倉庫の一覧を読み終わったら画面を更新する
    this.strsrv.getStore().then(() => this.cdRef.detectChanges()).catch(e => console.log('error store', e));
  }

  ngOnDestroy(): void {
    this.stop();
    this.audio?.close();
  }

  /** 出す行（在庫も引当も無い倉庫は、「すべての倉庫」のときだけ出す。この端末の倉庫はいつも出す） */
  get shown(): StockRow[] {
    return this.showAll ? this.rows : this.rows.filter(r => r.mine || r.stock || r.pable || r.hikat || r.keepd || r.kakod);
  }

  get total(): { stock: number; pable: number } {
    return this.rows.reduce((a, r) => ({ stock: a.stock + (r.stock ?? 0), pable: a.pable + r.pable }), { stock: 0, pable: 0 });
  }

  toggleAll() {
    this.showAll = !this.showAll;
    try {
      localStorage.setItem(KEY, JSON.stringify({ showAll: this.showAll }));
    } catch {
      // 保存できなくても使える
    }
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
      console.log('error stockscan camera', e);
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
    // 読んだらカメラを止めて、在庫を見てもらう
    this.stop();
    this.open(text.trim());
  }

  /** 商品を出す（倉庫ごとの在庫・受注可能数・入荷予定） */
  async open(code: string) {
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      await this.strsrv.getStore();
      const g = await this.tanasrv.findGoods(code);
      if (!g) {
        this.goods = null;
        this.rows = [];
        this.plan = null;
        this.show('商品が見つかりません（' + code + '）', 'ng');
      } else {
        this.goods = g;
        this.rows = [];
        this.plan = null;
        if (g.gskbn == '0') {
          const [rows, plan] = await Promise.all([this.stockRows(g.gcode), this.stcsrv.getShcount0(g.gcode)]);
          this.rows = rows;
          this.plan = plan;
        } else if (g.gskbn == '1') {
          this.rows = await this.setRows(g.gcode);
        }
        this.history = [{ gcode: g.gcode, gtext: g.gtext }, ...this.history.filter(h => h.gcode != g.gcode)].slice(0, 20);
        this.show(g.gcode + ' を読みました', 'ok');
      }
    } catch (e) {
      this.show('読めませんでした：' + (e as Error).message, 'ng');
      console.log('error stockscan open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** もう一度読む（今の数に更新） */
  reload() {
    if (this.goods) {
      this.open(this.goods.gcode);
    }
  }

  /** PC の現在庫確認を開く（受払の明細や出荷数を見るとき） */
  openPc() {
    if (this.goods) {
      this.usrsrv.openRepstc(this.goods.gcode, this.myScode);
    }
  }

  /** 在庫品：倉庫ごとの在庫 */
  private async stockRows(gcode: string): Promise<StockRow[]> {
    const rows = await Promise.all(this.strsrv.scds.filter(s => s.value).map(async s => {
      const st = (await this.stcsrv.getStock(gcode, '0', String(s.value), undefined, true))[0];
      if (!st) {
        return null;
      }
      const hikat = st.hikat || 0;
      const keepd = st.keepd || 0;
      const kakod = st.kakod || 0;
      const stock = st.stock || 0;
      return { scode: String(s.value), name: s.viewval, stock, pable: stock - hikat - keepd - kakod, hikat, keepd, kakod, mine: s.value == this.myScode } as StockRow;
    }));
    return this.sortRows(rows.filter((r): r is StockRow => r != null));
  }

  /** セット品：構成品の在庫から、倉庫ごとに受注可能数を出す */
  private async setRows(gcode: string): Promise<StockRow[]> {
    const Get = gql`
      query get_setzai($id: smallint!, $gcode: String!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_eq: $gcode}}) {
          msgzais { zcode irisu msgoods { gskbn } }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ msgoods: { msgzais: GzaiRef[] }[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, gcode }
    }));
    const zais = res.data?.msgoods[0]?.msgzais ?? [];
    if (zais.length == 0) {
      return [];
    }
    const rows = await Promise.all(this.strsrv.scds.filter(s => s.value).map(async s => {
      const parts = await this.stcsrv.getSetZai(String(s.value), zais);
      if (parts.length == 0) {
        return null;
      }
      const pable = this.stcsrv.getPaabl(parts);
      return { scode: String(s.value), name: s.viewval, stock: null, pable: pable == 9999 ? 0 : pable, hikat: 0, keepd: 0, kakod: 0, mine: s.value == this.myScode } as StockRow;
    }));
    return this.sortRows(rows.filter((r): r is StockRow => r != null));
  }

  /** この端末の倉庫を先頭に、あとは倉庫の並び順 */
  private sortRows(rows: StockRow[]): StockRow[] {
    return rows.sort((a, b) => Number(b.mine) - Number(a.mine));
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
