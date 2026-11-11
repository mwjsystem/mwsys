import { Component, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, viewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import type { IScannerControls } from '@zxing/browser';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StockService } from './../services/stock.service';
import { MovingService, Zaiko } from './moving.service';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

/** 確認する明細 1 行 */
interface CheckItem {
  line: number;
  gcode: string;
  gtext: string;
  memo: string;
  tanano: string;
  jan: string;
  /** 数量区分（0: 在庫品、1: セット品）と、セット品の構成品 */
  gskbn: string;
  zais: { zcode: string; irisu: number }[];
  /** 移動伝票の数量 */
  suu: number;
  /** 倉庫で数えた数 */
  count: number;
  /** 出庫倉庫の在庫（在庫品のみ。読めなければ null） */
  stock: number | null;
  pable: number | null;
}

interface CheckDoc {
  denno: number; day: string; outcode: string; incode: string; outName: string; inName: string; dmemo: string;
  chk_at: string | null; chk_by: string | null; chkmemo: string | null;
}

interface CheckResult {
  trmovsub_by_pk: {
    denno: number; day: string | null; outcode: string; incode: string; dmemo: string | null;
    chk_at: string | null; chk_by: string | null; chkmemo: string | null;
    trmovdens: {
      line: number; gcode: string; suu: number; memo: string | null;
      msgood: { gtext: string | null; tanano: string | null; jan: string | null; gskbn: string | null; msgzais: { zcode: string; irisu: number; msgoods: { gskbn: string } }[] } | null;
    }[];
  } | null;
  msstore: { code: string; subname: string | null; name: string | null }[];
}

/**
 * 移動伝票の数量確認（倉庫のスマホ）。移動伝票・大会リストの QR コードを読んで伝票を開き、商品の JAN を読んで数える。
 * 出庫倉庫の在庫も見られる。「数量を確定」で、数えた数と違う明細の数量を直し（在庫の移動数も直す）、確認した日時・担当者・内容を
 * 移動伝票に記録する（操作ログに「倉庫確認」として残る）。カメラは https でだけ使える。バーコードリーダー（キーボード入力）でも読める
 */
@Component({
  selector: 'app-movcheck',
  templateUrl: './movcheck.component.html',
  styleUrls: ['./../frmship/pick.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIcon]
})
export class MovcheckComponent implements AfterViewInit, OnDestroy {
  private usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private stcsrv = inject(StockService);
  private movsrv = inject(MovingService);
  private apollo = inject(Apollo);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  denno = 0;
  doc?: CheckDoc;
  items: CheckItem[] = [];
  mode: '' | 'qr' | 'item' = '';
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  otherDenno = 0;
  dbMismatch = '';
  manual = '';
  busy = false;
  /** 確定した（このスマホで） */
  completed = false;

  private controls?: IScannerControls;
  private stream?: MediaStream;
  private zxing = Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  private lastText = '';
  private lastAt = 0;
  private audio?: AudioContext;

  constructor() {
    this.title.setTitle('移動伝票の確認(MWSystem)');
  }

  ngAfterViewInit(): void {
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
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

  switchDb() {
    if (this.dbMismatch == 'test') {
      localStorage.setItem('MWSYS_DB', 'test');
    } else {
      localStorage.removeItem('MWSYS_DB');
    }
    window.location.reload();
  }

  get countSum(): number {
    return this.items.reduce((a, e) => a + e.count, 0);
  }

  get suuSum(): number {
    return this.items.reduce((a, e) => a + e.suu, 0);
  }

  /** 数えた数と移動伝票の数量が違う明細 */
  get diffs(): CheckItem[] {
    return this.items.filter(e => e.count != e.suu);
  }

  staffName(code: string | null): string {
    return code ? (this.stfsrv.getName(code) || code) : '';
  }

  chkText(at: string | null): string {
    if (!at) {
      return '';
    }
    const t = new Date(at);
    return (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  }

  async open(denno: number) {
    this.busy = true;
    this.otherDenno = 0;
    this.completed = false;
    this.doc = undefined;
    this.items = [];
    this.show('移動伝票 ' + denno + ' を読み込んでいます…', 'info');
    this.cdRef.detectChanges();
    try {
      const Get = gql`
        query get_movcheck($id: smallint!, $dno: Int!) {
          trmovsub_by_pk(id: $id, denno: $dno) {
            denno day outcode incode dmemo chk_at chk_by chkmemo
            trmovdens(order_by: {line: asc}) {
              line gcode suu memo
              msgood { gtext tanano jan gskbn msgzais { zcode irisu msgoods { gskbn } } }
            }
          }
          msstore(where: {id: {_eq: $id}}) { code subname name }
        }`;
      const res = await firstValueFrom(this.apollo.query<CheckResult>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('読めませんでした');
      }
      const m = res.data.trmovsub_by_pk;
      this.denno = denno;
      history.replaceState('', '', './frmmove/check/' + denno + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test'));
      if (!m) {
        this.show('移動伝票 ' + denno + ' が見つかりません', 'ng');
      } else {
        const name = (c: string) => { const s = res.data!.msstore.find(e => e.code == c); return s?.subname || s?.name || c; };
        this.doc = {
          denno: m.denno, day: (m.day ?? '').slice(0, 10), outcode: m.outcode, incode: m.incode, outName: name(m.outcode), inName: name(m.incode),
          dmemo: m.dmemo ?? '', chk_at: m.chk_at, chk_by: m.chk_by, chkmemo: m.chkmemo
        };
        this.items = m.trmovdens.map(l => ({
          line: l.line, gcode: l.gcode, gtext: l.msgood?.gtext ?? '', memo: l.memo ?? '', tanano: l.msgood?.tanano ?? '',
          jan: (l.msgood?.jan ?? '').trim(), gskbn: l.msgood?.gskbn ?? '0',
          zais: (l.msgood?.msgzais ?? []).filter(z => z.msgoods?.gskbn == '0').map(z => ({ zcode: z.zcode, irisu: Number(z.irisu) })),
          suu: Number(l.suu ?? 0), count: 0, stock: null, pable: null
        }));
        this.loadStock();
        if (m.chk_at) {
          this.show('この伝票は確認済です（' + this.chkText(m.chk_at) + ' ' + this.staffName(m.chk_by) + '）。もう一度確認できます', 'info');
        } else if (this.controls) {
          this.mode = 'item';
          this.show('商品のバーコードを読んでください', 'info');
        } else {
          this.show('「商品を読む」を押して、商品のバーコードを読んでください', 'info');
          this.start('item', false);
        }
      }
    } catch (e) {
      this.show('移動伝票を読めませんでした：' + (e as Error).message, 'ng');
      console.log('error movcheck open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 出庫倉庫の在庫（在庫品だけ。表示用なので、読めなくても止めない） */
  private loadStock() {
    const d = this.doc;
    if (!d) {
      return;
    }
    for (const it of this.items.filter(e => e.gskbn == '0')) {
      this.stcsrv.getStock(it.gcode, '0', d.outcode).then(r => {
        const st = r[0];
        if (st && this.doc === d) {
          it.stock = Number(st.stock ?? 0);
          it.pable = Number(st.stock ?? 0) - Number(st.hikat ?? 0) - Number(st.keepd ?? 0);
          this.cdRef.detectChanges();
        }
      }).catch(e => console.log('error movcheck stock', e));
    }
  }

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
        // 自動起動できなかっただけ
      } else if (name == 'NotAllowedError') {
        this.show('カメラの使用が許可されていません。ブラウザの設定でカメラを許可してから、もう一度「商品を読む」を押してください', 'ng');
      } else {
        this.show('カメラを起動できませんでした：' + (e as Error).message, 'ng');
      }
      console.log('error movcheck camera', e);
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

  onManual() {
    const text = this.manual.trim();
    this.manual = '';
    if (text) {
      this.onCode(text, true);
    }
  }

  onCode(text: string, typed = false) {
    const now = Date.now();
    if (!typed && text == this.lastText && now - this.lastAt < 1500) {
      return;
    }
    this.lastText = text;
    this.lastAt = now;
    if (/\/frmship\/(pick|keep)\//.test(text)) {
      this.show('受注伝票の QR コードです。移動伝票（大会リスト）の QR コードを読んでください', 'ng');
      this.cdRef.detectChanges();
      return;
    }
    const q = text.match(/\/frmmove\/check\/(\d+)/);
    const m = q ? q[1] : (this.mode == 'qr' || !this.doc ? text.match(/^(\d{6,8})$/)?.[1] : null);
    if (m) {
      const dno = Number(m);
      if (!this.doc || this.countSum == 0) {
        this.open(dno);
      } else if (dno != this.denno) {
        this.otherDenno = dno;
        this.show('別の移動伝票（' + dno + '）の QR コードです', 'ng');
      }
      this.cdRef.detectChanges();
      return;
    }
    if (!this.doc) {
      this.show('先に移動伝票（大会リスト）の QR コードを読んでください', 'ng');
      this.cdRef.detectChanges();
      return;
    }
    const code = text.trim();
    const hits = this.items.filter(e => e.jan == code || e.gcode == code);
    const item = hits.find(e => e.count < e.suu) ?? hits[0];
    if (!item) {
      this.show('この伝票に無い商品です（' + code + '）', 'ng');
    } else {
      item.count++;
      const over = item.count > item.suu;
      this.show(item.gcode + '　' + item.count + ' / ' + item.suu + (over ? '　伝票の数量より多いです' : ''), over ? 'ng' : 'ok');
    }
    this.cdRef.detectChanges();
  }

  add(item: CheckItem, n: number) {
    item.count = Math.max(0, item.count + n);
  }

  /** 伝票の数量どおりにする（数えずに、伝票の数でよいとき） */
  asIs(item: CheckItem) {
    item.count = item.suu;
  }

  /**
   * 数量を確定する。数えた数と違う明細は移動伝票の数量を直し、在庫の移動数（出庫倉庫・入庫倉庫）も差の分だけ直す。
   * 確認した日時・担当者・内容を移動伝票に記録する（操作ログに残る）。伝票・明細・在庫を 1 トランザクションで書く
   */
  async complete() {
    const d = this.doc;
    if (!d) {
      return;
    }
    const diffs = this.diffs;
    const text = diffs.length == 0
      ? '数量は伝票どおりです（' + this.items.length + ' 行）'
      : diffs.map(e => e.gcode + ' ' + e.suu + '→' + e.count).join('、');
    if (!confirm(diffs.length == 0 ? text + '。確認済にしますか？' : '次の数量を直します：\n' + text + '\n\nよろしいですか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const id = this.usrsrv.compid;
      const zaiko: Zaiko[] = [];
      for (const e of diffs) {
        const diff = e.count - e.suu;
        const parts = e.gskbn == '1' ? e.zais.map(z => ({ gcode: z.zcode, n: diff * z.irisu })) : e.gskbn == '0' ? [{ gcode: e.gcode, n: diff }] : [];
        for (const p of parts) {
          zaiko.push({ scode: d.incode, gcode: p.gcode, day: d.day, movi: p.n, movo: 0 }, { scode: d.outcode, gcode: p.gcode, day: d.day, movi: 0, movo: p.n });
        }
      }
      const { zinit, zinc } = this.movsrv.zaikoRows(zaiko);
      const Upd = gql`
        mutation upd_movcheck($id: smallint!, $dno: Int!, $set: trmovsub_set_input!, $mei: [trmovden_updates!]!,
          $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
          update_trmovden_many(updates: $mei) { affected_rows }
          insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
          update_trzaiko_many(updates: $zinc) { affected_rows }
          update_trmovsub_by_pk(pk_columns: {id: $id, denno: $dno}, _set: $set) { denno chk_at chk_by chkmemo }
        }`;
      const res = await firstValueFrom(this.apollo.mutate<{ update_trmovsub_by_pk: { chk_at: string; chk_by: string; chkmemo: string } | null }>({
        mutation: Upd,
        variables: {
          id, dno: d.denno,
          set: { chk_at: new Date(), chk_by: this.usrsrv.staff?.code ?? null, chkmemo: (diffs.length ? '数量変更 ' : '') + text },
          mei: diffs.map(e => ({ where: { id: { _eq: id }, denno: { _eq: d.denno }, line: { _eq: e.line } }, _set: { suu: e.count } })),
          zinit, zinc
        }
      }));
      if (res.error || !res.data?.update_trmovsub_by_pk) {
        throw res.error ?? new Error('移動伝票が見つかりません');
      }
      const r = res.data.update_trmovsub_by_pk;
      d.chk_at = r.chk_at;
      d.chk_by = r.chk_by;
      d.chkmemo = r.chkmemo;
      diffs.forEach(e => e.suu = e.count);
      this.completed = true;
      this.stop();
      this.show('確認済にしました（移動伝票 ' + d.denno + (diffs.length ? '。' + diffs.length + ' 行の数量を直しました' : '') + '）', 'ok');
    } catch (e) {
      this.show('更新できませんでした：' + (e as Error).message, 'ng');
      console.log('error movcheck complete', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  next() {
    this.doc = undefined;
    this.items = [];
    this.denno = 0;
    this.completed = false;
    history.replaceState('', '', './frmmove/check');
    this.show('移動伝票（大会リスト）の QR コードを読んでください', 'info');
    this.start('qr');
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
