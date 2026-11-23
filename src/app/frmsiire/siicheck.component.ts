import { Component, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, viewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import type { Worker as OcrWorker } from 'tesseract.js';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

/** チェックする仕入伝票 */
interface CheckDoc {
  denno: number; vname: string; inday: string; scode: string;
  chk_at: string | null; chk_by: string | null; chkmemo: string | null;
}

/** チェックする仕入明細 1 行 */
interface CheckLine {
  denno: number; line: number; gcode: string; gtext: string; tanano: string; mmemo: string;
  /** 発注番号・行（箱の PO 番号） */
  hdenno: number; hline: number;
  /** 仕入明細の数量 */
  suu: number;
  /** 倉庫で数えた数量・箱数（trsiichk。どのスマホで数えた分も入る） */
  chksuu: number; chkbox: number;
  updated_by: string | null;
  /** このスマホで最後に足した 1 箱の数量（次の箱の数量の初期値） */
  lastQty: number;
  /** 文字認識で当てた点数（候補の並び） */
  score: number;
}

interface ChkRow { denno: number; line: number; chksuu: number; chkbox: number; updated_by: string | null }

interface CheckResult {
  trsiiden: {
    denno: number; inday: string | null; scode: string | null; chk_at: string | null; chk_by: string | null; chkmemo: string | null;
    msvendor: { adrname: string | null } | null;
    trsiimeis: { line: number; gcode: string; suu: number; hdenno: number | null; hline: number | null; mmemo: string | null; msgood: { gtext: string | null; tanano: string | null } | null }[];
  }[];
  trsiichk: ChkRow[];
}

/** 文字認識の結果から拾ったもの */
interface OcrHit { pos: number[]; tokens: string[]; qty: number | null }

/**
 * 海外入荷チェック（倉庫のスマホ）。現行の「海外入荷チェックリスト」（印刷して紙でチェック）の置き換え。
 * 仕入伝票番号を指定して仕入明細を出し、入荷した箱のラベルをカメラで撮って文字認識（PO 番号＝発注番号・品番・数量）で明細を探す。
 * 明細をタップして、その箱の数量を足し込む（trsiichk。複数のスマホで分けて数えられる）。箱にバーコードはないので、
 * 読めないとき（手書きなど）は一覧から探してタップする。「チェック完了」で、確認した日時・担当者・合わなかった明細を仕入伝票に記録する
 * （操作ログに「入荷チェック」として残る）。仕入伝票の数量は直さない。カメラは https でだけ使える
 */
@Component({
  selector: 'app-siicheck',
  templateUrl: './siicheck.component.html',
  styleUrls: ['./../frmship/pick.component.scss', './siicheck.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIcon]
})
export class SiicheckComponent implements AfterViewInit, OnDestroy {
  private usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private apollo = inject(Apollo);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  docs: CheckDoc[] = [];
  lines: CheckLine[] = [];
  /** 入力中の仕入伝票番号 */
  dennoText = '';
  /** 一覧の絞り込み（品番・PO 番号・商品名） */
  filter = '';
  /** 文字認識で見つかった候補 */
  cands: CheckLine[] = [];
  /** 数量を足す明細 */
  sel?: CheckLine;
  qty = 0;
  ocrText = '';
  showOcr = false;
  camera = false;
  ocrBusy = false;
  busy = false;
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  dbMismatch = '';

  private stream?: MediaStream;
  private worker?: Promise<OcrWorker>;
  private audio?: AudioContext;
  private onVisible = () => {
    if (document.visibilityState == 'visible' && this.docs.length) {
      this.refreshChk();
    }
  };

  constructor() {
    this.title.setTitle('海外入荷チェック(MWSystem)');
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
    const list = this.parseDennos(this.route.snapshot.paramMap.get('dennos') ?? '');
    if (list.length && !this.dbMismatch) {
      this.open(list);
    } else if (!this.dbMismatch) {
      this.show('仕入伝票番号を入れて「開く」を押してください', 'info');
    }
    document.addEventListener('visibilitychange', this.onVisible);
    this.cdRef.detectChanges();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisible);
    this.stopCamera();
    this.worker?.then(w => w.terminate()).catch(() => undefined);
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

  private parseDennos(text: string): number[] {
    return [...new Set(text.split(/[^0-9]+/).map(Number).filter(n => n > 0))];
  }

  // ---------------------------------------------------------------- 読み込み

  get suuSum(): number {
    return this.lines.reduce((a, e) => a + e.suu, 0);
  }

  get chkSum(): number {
    return this.lines.reduce((a, e) => a + e.chksuu, 0);
  }

  get boxSum(): number {
    return this.lines.reduce((a, e) => a + e.chkbox, 0);
  }

  get doneCount(): number {
    return this.lines.filter(e => e.chksuu == e.suu).length;
  }

  /** 数えた数量と仕入明細の数量が違う明細 */
  get diffs(): CheckLine[] {
    return this.lines.filter(e => e.chksuu != e.suu);
  }

  /** 一覧に出す明細（絞り込み） */
  get shown(): CheckLine[] {
    const f = this.filter.trim().toUpperCase();
    if (!f) {
      return this.lines;
    }
    const fn = this.norm(f);
    return this.lines.filter(e => String(e.hdenno).includes(f) || e.gcode.toUpperCase().includes(f) || (fn.length >= 2 && this.norm(e.gcode).includes(fn))
      || e.gtext.toUpperCase().includes(f));
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

  /** 入力した仕入伝票番号を開く（add: 今の伝票に足す） */
  openInput(add: boolean) {
    const list = this.parseDennos(this.dennoText);
    if (!list.length) {
      this.show('仕入伝票番号を入れてください', 'ng');
      return;
    }
    this.dennoText = '';
    this.open(add ? [...new Set([...this.docs.map(d => d.denno), ...list])] : list);
  }

  async open(dennos: number[]) {
    this.busy = true;
    this.sel = undefined;
    this.cands = [];
    this.show('仕入伝票 ' + dennos.join(', ') + ' を読み込んでいます…', 'info');
    this.cdRef.detectChanges();
    try {
      const Get = gql`
        query get_siicheck($id: smallint!, $d: [Int!]!) {
          trsiiden(where: {id: {_eq: $id}, denno: {_in: $d}}, order_by: {denno: asc}) {
            denno inday scode chk_at chk_by chkmemo
            msvendor { adrname }
            trsiimeis(order_by: {line: asc}) { line gcode suu hdenno hline mmemo msgood { gtext tanano } }
          }
          trsiichk(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno line chksuu chkbox updated_by }
        }`;
      const res = await firstValueFrom(this.apollo.query<CheckResult>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, d: dennos }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('読めませんでした');
      }
      const found = res.data.trsiiden;
      const missing = dennos.filter(d => !found.some(e => e.denno == d));
      const keep = new Map(this.lines.map(l => [l.denno + '_' + l.line, l.lastQty]));
      this.docs = found.map(s => ({
        denno: s.denno, vname: s.msvendor?.adrname ?? '', inday: (s.inday ?? '').slice(0, 10), scode: s.scode ?? '',
        chk_at: s.chk_at, chk_by: s.chk_by, chkmemo: s.chkmemo
      }));
      this.lines = found.flatMap(s => s.trsiimeis.map(m => ({
        denno: s.denno, line: m.line, gcode: (m.gcode ?? '').trim(), gtext: m.msgood?.gtext ?? '', tanano: m.msgood?.tanano ?? '', mmemo: m.mmemo ?? '',
        hdenno: Number(m.hdenno ?? 0), hline: Number(m.hline ?? 0), suu: Number(m.suu ?? 0),
        chksuu: 0, chkbox: 0, updated_by: null, lastQty: keep.get(s.denno + '_' + m.line) ?? 0, score: 0
      })));
      // 箱は PO（発注番号）ごとに来るので、発注番号・品番の順に並べる
      this.lines.sort((a, b) => a.hdenno - b.hdenno || a.gcode.localeCompare(b.gcode) || a.denno - b.denno || a.line - b.line);
      this.applyChk(res.data.trsiichk);
      const ds = this.docs.map(d => d.denno);
      history.replaceState('', '', './frmsiire/check' + (ds.length ? '/' + ds.join(',') : '') + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test'));
      if (missing.length) {
        this.show('仕入伝票 ' + missing.join(', ') + ' が見つかりません', 'ng');
      } else if (this.docs.some(d => d.chk_at)) {
        this.show('チェック済の伝票があります。続けて数えられます', 'info');
      } else {
        this.show('箱のラベルを「撮って読む」か、一覧の明細をタップしてください', 'info');
      }
    } catch (e) {
      this.show('仕入伝票を読めませんでした：' + (e as Error).message, 'ng');
      console.log('error siicheck open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  private applyChk(rows: ChkRow[]) {
    for (const l of this.lines) {
      const r = rows.find(e => e.denno == l.denno && e.line == l.line);
      l.chksuu = Number(r?.chksuu ?? 0);
      l.chkbox = Number(r?.chkbox ?? 0);
      l.updated_by = r?.updated_by ?? null;
    }
  }

  /** ほかのスマホで数えた分も読み直す */
  async refreshChk() {
    const d = this.docs.map(e => e.denno);
    if (!d.length) {
      return;
    }
    try {
      const Get = gql`
        query get_siichk($id: smallint!, $d: [Int!]!) {
          trsiichk(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno line chksuu chkbox updated_by }
        }`;
      const res = await firstValueFrom(this.apollo.query<{ trsiichk: ChkRow[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, d }
      }));
      if (res.data) {
        this.applyChk(res.data.trsiichk);
      }
    } catch (e) {
      console.log('error siicheck refresh', e);
    }
    this.cdRef.detectChanges();
  }

  // ---------------------------------------------------------------- 数える

  /** 明細を選んで、箱の数量を入れる */
  select(l: CheckLine, qty: number | null = null) {
    this.sel = l;
    const avg = l.chkbox > 0 && Number.isInteger(l.chksuu / l.chkbox) ? l.chksuu / l.chkbox : 0;
    this.qty = qty && qty > 0 ? qty : (l.lastQty || avg || Math.max(l.suu - l.chksuu, 0) || 1);
    this.cdRef.detectChanges();
    setTimeout(() => document.querySelector('.selpanel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  addQty(n: number) {
    this.qty = Math.max(0, (Number(this.qty) || 0) + n);
  }

  /** 選んだ明細に 1 箱（sign = -1 は 1 箱取り消す） */
  async count(sign: 1 | -1) {
    const l = this.sel;
    const q = Number(this.qty) || 0;
    if (!l || q <= 0) {
      this.show('数量を入れてください', 'ng');
      return;
    }
    if (sign < 0 && (l.chkbox <= 0 || l.chksuu < q)) {
      this.show('取り消す分がありません', 'ng');
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const id = this.usrsrv.compid;
      const by = this.usrsrv.staff?.code ?? null;
      const Inc = gql`
        mutation inc_siichk($obj: [trsiichk_insert_input!]!, $upd: [trsiichk_updates!]!) {
          insert_trsiichk(objects: $obj, on_conflict: {constraint: trsiichk_pkey, update_columns: []}) { affected_rows }
          update_trsiichk_many(updates: $upd) { returning { denno line chksuu chkbox updated_by } }
        }`;
      const res = await firstValueFrom(this.apollo.mutate<{ update_trsiichk_many: { returning: ChkRow[] }[] }>({
        mutation: Inc,
        variables: {
          obj: [{ id, denno: l.denno, line: l.line, chksuu: 0, chkbox: 0, updated_by: by }],
          upd: [{
            where: { id: { _eq: id }, denno: { _eq: l.denno }, line: { _eq: l.line } },
            _inc: { chksuu: sign * q, chkbox: sign }, _set: { updated_at: new Date(), updated_by: by }
          }]
        }
      }));
      const r = res.data?.update_trsiichk_many?.[0]?.returning?.[0];
      if (res.error || !r) {
        throw res.error ?? new Error('書き込めませんでした');
      }
      l.chksuu = Number(r.chksuu);
      l.chkbox = Number(r.chkbox);
      l.updated_by = r.updated_by;
      if (sign > 0) {
        l.lastQty = q;
      }
      const over = l.chksuu > l.suu;
      const text = l.gcode + '　' + (sign > 0 ? '+' : '−') + q + '　→ ' + l.chksuu + ' / ' + l.suu + '（' + l.chkbox + '箱）';
      this.show(over ? text + '　伝票の数量より多いです' : l.chksuu == l.suu ? text + '　そろいました' : text, over ? 'ng' : 'ok');
      this.sel = undefined;
      this.cands = [];
      this.refreshChk();
    } catch (e) {
      this.show('書き込めませんでした：' + (e as Error).message, 'ng');
      console.log('error siicheck count', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 明細の数えた数を 0 に戻す */
  async reset(l: CheckLine) {
    if (!confirm(l.gcode + ' の数えた数（' + l.chksuu + '、' + l.chkbox + '箱）を 0 に戻しますか？\n（ほかのスマホで数えた分も消えます）')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const id = this.usrsrv.compid;
      const Upd = gql`
        mutation reset_siichk($id: smallint!, $d: Int!, $l: Int!, $set: trsiichk_set_input!) {
          update_trsiichk(where: {id: {_eq: $id}, denno: {_eq: $d}, line: {_eq: $l}}, _set: $set) { affected_rows }
        }`;
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Upd,
        variables: { id, d: l.denno, l: l.line, set: { chksuu: 0, chkbox: 0, updated_at: new Date(), updated_by: this.usrsrv.staff?.code ?? null } }
      }));
      if (res.error) {
        throw res.error;
      }
      l.chksuu = 0;
      l.chkbox = 0;
      this.sel = undefined;
      this.show(l.gcode + ' を 0 に戻しました', 'info');
    } catch (e) {
      this.show('書き込めませんでした：' + (e as Error).message, 'ng');
      console.log('error siicheck reset', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** チェック完了。確認した日時・担当者・合わなかった明細を仕入伝票に記録する（数量は直さない） */
  async complete() {
    if (!this.docs.length) {
      return;
    }
    const diffs = this.diffs;
    const text = diffs.length == 0
      ? '数量はすべて伝票どおりです（' + this.lines.length + ' 行）。チェック完了にしますか？'
      : '次の明細の数量が合いません（伝票→数えた数）：\n' + diffs.map(e => e.gcode + ' ' + e.suu + '→' + e.chksuu).join('\n') + '\n\nこのままチェック完了にしますか？（仕入伝票の数量は直りません）';
    if (!confirm(text)) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const id = this.usrsrv.compid;
      const now = new Date();
      const by = this.usrsrv.staff?.code ?? null;
      const updates = this.docs.map(d => {
        const ls = this.lines.filter(e => e.denno == d.denno);
        const df = ls.filter(e => e.chksuu != e.suu);
        const memo = (df.length == 0 ? '数量どおり（' + ls.length + ' 行）' : '数量違い ' + df.map(e => e.gcode + ' ' + e.suu + '→' + e.chksuu).join('、'))
          + ' 箱数 ' + ls.reduce((a, e) => a + e.chkbox, 0);
        return { where: { id: { _eq: id }, denno: { _eq: d.denno } }, _set: { chk_at: now, chk_by: by, chkmemo: memo } };
      });
      const Upd = gql`
        mutation upd_siicheck($u: [trsiiden_updates!]!) {
          update_trsiiden_many(updates: $u) { returning { denno chk_at chk_by chkmemo } }
        }`;
      const res = await firstValueFrom(this.apollo.mutate<{ update_trsiiden_many: { returning: { denno: number; chk_at: string; chk_by: string | null; chkmemo: string }[] }[] }>({
        mutation: Upd, variables: { u: updates }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('書き込めませんでした');
      }
      for (const r of res.data.update_trsiiden_many.flatMap(e => e.returning)) {
        const d = this.docs.find(e => e.denno == r.denno);
        if (d) {
          d.chk_at = r.chk_at;
          d.chk_by = r.chk_by;
          d.chkmemo = r.chkmemo;
        }
      }
      this.stopCamera();
      this.show('チェック完了にしました（仕入伝票 ' + this.docs.map(d => d.denno).join(', ') + (diffs.length ? '。数量違い ' + diffs.length + ' 行' : '') + '）', diffs.length ? 'ng' : 'ok');
    } catch (e) {
      this.show('書き込めませんでした：' + (e as Error).message, 'ng');
      console.log('error siicheck complete', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  // ---------------------------------------------------------------- カメラ・文字認識

  async startCamera() {
    if (this.stream) {
      return;
    }
    const video = this.video()?.nativeElement;
    if (!video) {
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.show('この画面ではカメラを使えません（https で開いてください）。「写真から」か一覧のタップを使ってください', 'ng');
      this.cdRef.detectChanges();
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false
      });
      video.srcObject = this.stream;
      await video.play();
      this.camera = true;
      this.prepareOcr();
      this.show('ラベル全体が枠に入るように写して「撮って読む」を押してください', 'info');
    } catch (e) {
      this.stopCamera();
      const name = (e as DOMException)?.name;
      this.show(name == 'NotAllowedError'
        ? 'カメラの使用が許可されていません。ブラウザの設定でカメラを許可してから、もう一度押してください'
        : 'カメラを起動できませんでした：' + (e as Error).message, 'ng');
      console.log('error siicheck camera', e);
    }
    this.cdRef.detectChanges();
  }

  stopCamera() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
    const video = this.video()?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
    this.camera = false;
  }

  /**
   * 文字認識の準備（初回は認識用のデータを読み込むので時間がかかる）。
   * 認識用のファイルは CDN でなく、このアプリのサーバーから配る（angular.json の assets で node_modules から dist/tesseract に写す）。
   * 倉庫の回線で CDN につながらないと iPhone で準備に失敗したため。パスは worker の中で使うので絶対 URL にする。
   * 端末内のキャッシュ（IndexedDB）は使わない（ブラウザの HTTP キャッシュで足りる）
   */
  private prepareOcr(): Promise<OcrWorker> {
    this.worker ??= (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const base = location.origin + '/tesseract';
      const w = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: base + '/worker.min.js', corePath: base + '/core', langPath: base + '/lang', cacheMethod: 'none'
      });
      await w.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/.:'#, ",
      });
      return w;
    })();
    this.worker.catch(() => this.worker = undefined);
    return this.worker;
  }

  /** カメラの映像を撮って読む */
  async shoot() {
    const video = this.video()?.nativeElement;
    if (!video || !this.camera || !video.videoWidth) {
      return;
    }
    await this.recognize(video, video.videoWidth, video.videoHeight);
  }

  /** スマホのカメラで撮った写真（ファイル）を読む */
  async fromFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      await this.recognize(bmp, bmp.width, bmp.height);
      bmp.close();
    } catch (e) {
      this.show('写真を読めませんでした：' + this.errText(e), 'ng');
      this.cdRef.detectChanges();
    }
  }

  private async recognize(src: CanvasImageSource, w: number, h: number) {
    if (this.ocrBusy) {
      return;
    }
    if (!this.lines.length) {
      this.show('先に仕入伝票を開いてください', 'ng');
      this.cdRef.detectChanges();
      return;
    }
    this.ocrBusy = true;
    this.sel = undefined;
    this.cands = [];
    this.show(this.worker ? '読んでいます…' : '文字認識の準備をしています（初回は数十秒かかります）…', 'info');
    this.cdRef.detectChanges();
    // どの段階で止まったかを、エラーの表示に出す
    let stage = '画像の準備';
    try {
      // 白黒にして、長い辺を 1600px 程度にそろえる（文字認識の速さと精度のため）
      const scale = Math.min(1, 1600 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.filter = 'grayscale(1) contrast(1.4)';
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      stage = '文字認識の準備（データの読み込み）';
      const worker = await this.prepareOcr();
      stage = '文字認識';
      const { data } = await worker.recognize(canvas);
      this.ocrText = data.text.trim();
      this.match(this.ocrText);
    } catch (e) {
      this.show('文字認識できませんでした（' + stage + '）：' + this.errText(e), 'ng');
      console.log('error siicheck ocr', stage, e);
    }
    this.ocrBusy = false;
    this.cdRef.detectChanges();
  }

  /** 品番の比べ方: 英数字だけにして、英字のあとの 0（JU02 → JU2）を除く */
  private norm(s: string): string {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/([A-Z])0+(?=\d)/g, '$1');
  }

  /** 文字認識の結果から、PO 番号（発注番号）・品番らしいもの・数量を拾う */
  parse(text: string): OcrHit {
    const up = text.toUpperCase();
    // 数字が多い語は、読み違えやすい英字を数字にする（O→0、I・L→1、S→5、B→8）
    const fixDigits = (t: string) => (t.replace(/[^0-9]/g, '').length >= t.length * 0.6 ? t.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8') : t);
    const words = up.split(/[\s,:;'"#]+/).filter(Boolean);
    // PO 番号: 数字の並びの中に、開いている伝票の発注番号があるか（「13428756」のように前後に余計な字が付いても当てる）
    const known = [...new Set(this.lines.map(l => l.hdenno).filter(n => n > 0))];
    const pos = new Set<number>();
    for (const w of words) {
      for (const m of fixDigits(w).matchAll(/\d{5,}/g)) {
        known.filter(k => m[0].includes(String(k))).forEach(k => pos.add(k));
      }
    }
    // 品番: 英数字・ハイフンの並び。隣の語をつないだもの（「KK-HG15 -M-WH」のように分かれたとき）も候補にする
    const parts = up.split(/[^A-Z0-9-]+/).filter(t => t.replace(/-/g, '').length >= 2);
    const tokens = new Set<string>();
    parts.forEach((t, i) => {
      tokens.add(t);
      if (i + 1 < parts.length) {
        tokens.add(t + parts[i + 1]);
      }
    });
    let qty: number | null = null;
    const q = up.match(/[QO]\W{0,2}T\W{0,2}Y\W{0,10}?(\d{1,4})\b/) ?? up.match(/(?:^|\s)[A-Z0-9]{1,3}\s*\/\s*(\d{1,4})(?!\d)/m);
    if (q) {
      qty = Number(q[1]);
    }
    return { pos: [...pos], tokens: [...tokens], qty };
  }

  /** 文字認識の結果で明細に点数を付けて、候補を出す */
  match(text: string) {
    const hit = this.parse(text);
    const toks = hit.tokens.map(t => this.norm(t)).filter(t => t.length >= 3);
    for (const l of this.lines) {
      const g = this.norm(l.gcode);
      let best = 0;
      for (const t of toks) {
        let s = 0;
        if (t == g) {
          s = 100;
        } else if (g.length >= 4 && t.includes(g)) {
          s = 75;
        } else if (t.length >= 4 && g.includes(t)) {
          s = 35 + Math.round(40 * t.length / g.length);
        } else if (t.length >= 5 && Math.abs(t.length - g.length) <= 2) {
          const d = this.dist(t, g);
          s = d == 1 ? 80 : d == 2 && g.length >= 7 ? 60 : 0;
        }
        best = Math.max(best, s);
      }
      l.score = best + (hit.pos.includes(l.hdenno) ? 50 : 0);
    }
    const ranked = this.lines.filter(l => l.score >= 50).sort((a, b) => b.score - a.score || (a.chksuu >= a.suu ? 1 : 0) - (b.chksuu >= b.suu ? 1 : 0));
    this.cands = ranked.slice(0, 6);
    const top = ranked[0];
    const po = hit.pos.length ? 'PO ' + hit.pos.join(',') + '　' : '';
    const qt = hit.qty ? '数量 ' + hit.qty + '　' : '';
    if (!top) {
      this.show(po + qt + '明細が見つかりません。もう一度撮るか、一覧から探してタップしてください', 'ng');
    } else if (top.score >= 90 && (ranked.length == 1 || ranked[1].score <= top.score - 20)) {
      // はっきり 1 行に決まるときは、その行を選んでおく（足すのはボタンを押してから）
      this.show(po + qt + top.gcode + ' が見つかりました。数量を確かめて「足す」を押してください', 'ok');
      this.select(top, hit.qty);
    } else {
      this.show(po + qt + '候補が ' + this.cands.length + ' 行あります。箱の明細をタップしてください', 'info');
    }
    this.lastQty = hit.qty;
  }

  /** 候補をタップしたときの数量の初期値（文字認識で拾った数量） */
  lastQty: number | null = null;

  /** 文字の並びの違い（レーベンシュタイン距離） */
  private dist(a: string, b: string): number {
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] == b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  /** エラーの内容（文字認識のエラーは Error でなく文字列や Event で来ることがある） */
  private errText(e: unknown): string {
    if (e instanceof Error) {
      return e.message || e.name;
    }
    if (typeof Event != 'undefined' && e instanceof Event) {
      return e.type + '（' + ((e.target as { src?: string } | null)?.src ?? 'ネットワークか読み込みのエラー') + '）';
    }
    return String(e);
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
