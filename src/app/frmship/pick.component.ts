import { Component, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, viewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import type { IScannerControls } from '@zxing/browser';
import { ShipService } from './ship.service';
import { ShipDoc } from './ship-pdf.service';
import { JDST, shipNote } from './ship-forms';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

/** ピッキングの明細 1 行 */
interface PickItem {
  line: number;
  gcode: string;
  gtext: string;
  mmemo: string | null;
  tanano: string | null;
  jan: string;
  /** 確認する数（実物の商品でなければ 0 = 確認不要） */
  need: number;
  /** 確認した数 */
  done: number;
}

type PickDoc = ShipDoc & { jdstatus: string | null };

/**
 * ピッキング（倉庫のスマホ）。出荷指示書の QR コードを読んで伝票を開き、商品の JAN バーコードを 1 個ずつ読んで確認する。
 * すべて確認できたら「ピッキング完了」で受注ステータスを「ピッキング済」にする。
 * カメラは https（または localhost）でだけ使える。Bluetooth のバーコードリーダー（キーボード入力）でも読める。
 */
@Component({
  selector: 'app-pick',
  templateUrl: './pick.component.html',
  styleUrls: ['./pick.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIcon]
})
export class PickComponent implements AfterViewInit, OnDestroy {
  private usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  stfsrv = inject(StaffService);
  private shipsrv = inject(ShipService);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  denno = 0;
  doc?: PickDoc;
  items: PickItem[] = [];
  /** カメラで読んでいるもの（qr = 出荷指示書の QR、item = 商品のバーコード、'' = 止めている） */
  mode: '' | 'qr' | 'item' = '';
  /** 直前の読み取り結果の表示 */
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  /** 別の伝票の QR を読んだとき、その伝票番号（切り替えるか聞く） */
  otherDenno = 0;
  /** QR コードの接続先（テスト環境）と、この画面の接続先が違う */
  dbMismatch = '';
  /** バーコードリーダー（キーボード入力）・手入力の欄 */
  manual = '';
  busy = false;
  /** 完了した（または完了済の）とき */
  completed = false;

  private controls?: IScannerControls;
  private stream?: MediaStream;
  /** バーコード読み取りの部品（画面を開いたときに読み込んでおく。iPhone はカメラをタップの直後にしか起動できないため） */
  private zxing = Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  private lastText = '';
  private lastAt = 0;
  private audio?: AudioContext;

  constructor() {
    this.title.setTitle('ピッキング(MWSystem)');
  }

  ngAfterViewInit(): void {
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
    this.bunsrv.qryBunrui();
    const db = this.route.snapshot.queryParamMap.get('db');
    const isTest = localStorage.getItem('MWSYS_DB') != null;
    if ((db == 'test') != isTest) {
      this.dbMismatch = db == 'test' ? 'test' : 'prod';
    }
    const dno = Number(this.route.snapshot.paramMap.get('denno') ?? 0);
    if (dno && !this.dbMismatch) {
      this.open(dno);
    }
    this.cdRef.detectChanges();
  }

  ngOnDestroy(): void {
    this.stop();
    this.audio?.close();
  }

  /** QR コードの接続先に切り替えて開き直す */
  switchDb() {
    if (this.dbMismatch == 'test') {
      localStorage.setItem('MWSYS_DB', 'test');
    } else {
      localStorage.removeItem('MWSYS_DB');
    }
    window.location.reload();
  }

  get needItems(): PickItem[] {
    return this.items.filter(e => e.need > 0);
  }

  get doneCount(): number {
    return this.needItems.reduce((s, e) => s + Math.min(e.done, e.need), 0);
  }

  get needCount(): number {
    return this.needItems.reduce((s, e) => s + e.need, 0);
  }

  get allDone(): boolean {
    return this.needItems.every(e => e.done >= e.need);
  }

  /** 伝票を開く（カメラが動いていれば、そのまま商品の読み取りに使う） */
  async open(denno: number) {
    this.busy = true;
    this.otherDenno = 0;
    this.completed = false;
    this.doc = undefined;
    this.items = [];
    this.cdRef.detectChanges();
    try {
      const docs = await this.shipsrv.load([denno]) as PickDoc[];
      this.doc = docs[0];
      this.denno = denno;
      history.replaceState('', '', './frmship/pick/' + denno);
      if (!this.doc) {
        this.show('伝票 ' + denno + ' が見つかりません', 'ng');
      } else {
        this.items = this.doc.lines.map(l => ({
          line: l.line, gcode: l.gcode ?? '', gtext: l.gtext ?? '', mmemo: l.mmemo, tanano: l.tanano,
          jan: (l.jan ?? '').trim(),
          need: shipNote(l.gcode ?? '', l.gtext ?? '', this.doc!.mcode).check && l.suu > 0 ? l.suu : 0,
          done: 0
        }));
        this.completed = this.doc.jdstatus == JDST.PICKED;
        if (this.doc.jdstatus == JDST.TOROKU) {
          this.show('出荷指示のあとに受注伝票が変更されています。新しい出荷指示書か確認してください', 'ng');
          this.stop();
        } else if (this.completed) {
          this.show('この伝票はピッキング済です（もう一度確認できます）', 'info');
          this.stop();
        } else if (this.controls) {
          this.mode = 'item';
          this.show('商品のバーコードを読んでください', 'info');
        } else {
          // QR コードから開いたとき。iPhone ではタップしないとカメラを起動できないので、起動できなければボタンを案内する
          this.show('「商品を読む」を押して、商品のバーコードを読んでください', 'info');
          this.start('item', false);
        }
      }
    } catch (e) {
      this.show('伝票を読めませんでした：' + (e as Error).message, 'ng');
      console.log('error pick open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /**
   * カメラで読み取りを始める（QR コードも商品のバーコードも同じカメラで読む。mode は表示と解釈の切り替えだけ）。
   * tap = false は画面を開いたときの自動起動で、起動できなくてもエラーにしない（iPhone はタップでしか起動できない）
   */
  async start(mode: 'qr' | 'item', tap = true) {
    this.mode = mode;
    if (this.controls) {
      this.cdRef.detectChanges();
      return;
    }
    const video = this.video()?.nativeElement;
    if (!video) {
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.show('この画面ではカメラを使えません（https で開いてください）。バーコードリーダーか手入力を使ってください', 'ng');
      this.mode = '';
      this.cdRef.detectChanges();
      return;
    }
    let stream: MediaStream | undefined;
    try {
      // タップの直後に、ほかの処理を挟まずにカメラを求める（iPhone の制限）
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await this.zxing;
      const hints = new Map<unknown, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS,
          [BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]]
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<never, never>, { delayBetweenScanAttempts: 150 });
      this.stream = stream;
      this.controls = await reader.decodeFromStream(stream, video, result => {
        if (result) {
          this.onCode(result.getText());
        }
      });
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      this.mode = '';
      const name = (e as DOMException)?.name;
      if (name == 'NotAllowedError' && !tap) {
        // 自動起動できなかっただけ。案内のメッセージはそのまま
      } else if (name == 'NotAllowedError') {
        this.show('カメラの使用が許可されていません。iPhone は「設定」→ 使っているブラウザ（Safari・Chrome）→「カメラ」を許可にし、' +
          'ブラウザのこのサイトの設定でもカメラを許可してから、もう一度「商品を読む」を押してください', 'ng');
      } else {
        this.show('カメラを起動できませんでした：' + (e as Error).message, 'ng');
      }
      console.log('error pick camera', e);
    }
    this.cdRef.detectChanges();
  }

  stop() {
    this.controls?.stop();
    this.controls = undefined;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
    this.mode = '';
  }

  /** バーコードリーダー・手入力の Enter */
  onManual() {
    const text = this.manual.trim();
    this.manual = '';
    if (text) {
      this.onCode(text, true);
    }
  }

  /** 読み取った内容 */
  onCode(text: string, typed = false) {
    // カメラは同じコードを続けて読むので、同じ内容は 1.5 秒あける
    const now = Date.now();
    if (!typed && text == this.lastText && now - this.lastAt < 1500) {
      return;
    }
    this.lastText = text;
    this.lastAt = now;
    const m = text.match(/\/frmship\/pick\/(\d+)/) ?? (this.mode == 'qr' || !this.doc ? text.match(/^(\d{6,8})$/) : null);
    if (m) {
      const dno = Number(m[1]);
      if (!this.doc || this.doneCount == 0) {
        this.open(dno);
      } else if (dno != this.denno) {
        this.otherDenno = dno;
        this.show('別の伝票（' + dno + '）の QR コードです', 'ng');
      }
      this.cdRef.detectChanges();
      return;
    }
    if (!this.doc) {
      this.show('先に出荷指示書の QR コードを読んでください', 'ng');
      this.cdRef.detectChanges();
      return;
    }
    const code = text.trim();
    const hits = this.items.filter(e => e.need > 0 && (e.jan == code || e.gcode == code));
    const item = hits.find(e => e.done < e.need) ?? hits[0];
    if (!item) {
      this.show('この伝票に無い商品です（' + code + '）', 'ng');
    } else if (item.done >= item.need) {
      this.show(item.gcode + ' は数量（' + item.need + '）を超えています', 'ng');
    } else {
      item.done++;
      this.show(item.gcode + '　' + item.done + ' / ' + item.need + (this.allDone ? '　すべて確認できました' : ''), 'ok');
      if (this.allDone) {
        this.stop();
      }
    }
    this.cdRef.detectChanges();
  }

  /** 手で数を増減する（JAN の無い商品・ラベルが読めないとき） */
  add(item: PickItem, n: number) {
    item.done = Math.max(0, Math.min(item.need, item.done + n));
  }

  /** ピッキング完了 */
  async complete() {
    if (!this.doc || !this.allDone) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      await this.shipsrv.setPicked(this.doc.denno);
      this.completed = true;
      this.doc.jdstatus = JDST.PICKED;
      this.show('ピッキング完了にしました（伝票 ' + this.doc.denno + '）', 'ok');
    } catch (e) {
      this.show('ステータスを更新できませんでした：' + (e as Error).message, 'ng');
      console.log('error pick complete', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 次の伝票（出荷指示書の QR を読む） */
  next() {
    this.doc = undefined;
    this.items = [];
    this.denno = 0;
    this.completed = false;
    history.replaceState('', '', './frmship/pick');
    this.show('出荷指示書の QR コードを読んでください', 'info');
    this.start('qr');
  }

  statusName(value: string | null): string {
    return this.bunsrv.kbn['jdstatus']?.find(e => e.value == value)?.viewval ?? value ?? '';
  }

  private show(text: string, type: 'ok' | 'ng' | 'info') {
    this.msg = text;
    this.msgType = type;
    if (type != 'info') {
      this.beep(type == 'ok');
      navigator.vibrate?.(type == 'ok' ? 80 : [200, 100, 200]);
    }
  }

  /** 読み取り音（OK は高い短い音、NG は低い長い音） */
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
