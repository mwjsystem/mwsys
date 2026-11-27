import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { DecimalPipe } from '@angular/common';
import * as FileSaver from 'file-saver';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { UserService } from './../services/user.service';
import { RateService } from './../services/rate.service';
import { DEFAULT_PCODES, RepkessanService, TesuRow, UriRow, UrikakeRow, ZaikoRow } from './repkessan.service';
import { KessanSource, fillKessanBook } from './kessan-excel';

/** 売上の表の 1 行（月 × 税率、または合計） */
export interface UriLine { label: string; kbn: string; cnt: number | null; gtt: number; neb: number; sor: number; tes: number; sub: number; tax: number; total: number; sum?: boolean }
/** 倉庫ごとの在庫金額 */
export interface StoreSum { scode: string; name: string; rows: ZaikoRow[]; count: number; usd: number; yen: number }

export const KBN_NAMES = ['10%売上', '8%売上', '非課税売上'];
/** 在庫数がこれ以上の商品は、在庫を持たない受注生産品など（在庫数 9999 で登録してある）として在庫金額に入れない */
export const MUGEN = 9000;
/** USD の原価がこれ以上なら、円の原価に通貨 USD が付いている疑いがある（赤字で知らせる） */
export const USD_SUSPECT = 1000;

/**
 * 決算資料（現行の「YYYYMMDD決算.xlsx」の 売上・在庫金額・都度売掛 と、入金伝票の手数料）。
 * 期間（期首〜期末）を指定して集計し、画面で合計を確かめて、シート別の Excel に出す。
 */
@Component({
  selector: 'app-repkessan',
  templateUrl: './repkessan.component.html',
  styleUrls: ['./repkessan.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIcon, MatTabGroup, MatTab, FormsModule, DecimalPipe]
})
export class RepkessanComponent implements OnInit, KessanSource {
  private srv = inject(RepkessanService);
  private bunsrv = inject(BunruiService);
  private stfsrv = inject(StaffService);
  private usrsrv = inject(UserService);
  private ratesrv = inject(RateService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  from = '';
  to = '';
  /** 都度売掛の対象の支払方法 */
  pcodes = new Set<string>(DEFAULT_PCODES);
  /** 1 ドルの円（在庫の円換算）。集計のとき、期末日のレート（為替レートマスタ）を入れる。手で変えてもよい */
  rate: number | null = null;
  /** rate を入れた元（'master' = 為替レートマスタの期末日のレート、'manual' = 手で入れた） */
  rateFrom: 'master' | 'manual' | '' = '';
  /** 都度売掛で残高 0 の伝票も出す */
  withZero = false;
  /** 在庫に中止・終了品（tkbn が 0 以外）も含める（現行の在庫一覧表は「中止・終了商品を印刷しない」で出していた） */
  withEnd = false;

  busy = false;
  errors: Record<string, string> = {};
  /** 集計した期間 */
  shown?: { from: string; to: string; pcodes: string[] };

  uri: UriRow[] = [];
  uriLines: UriLine[] = [];
  urikake: UrikakeRow[] = [];
  tesu: TesuRow[] = [];
  zaiko: ZaikoRow[] = [];
  storeNames = new Map<string, string>();
  stores: StoreSum[] = [];

  constructor() {
    this.title.setTitle('決算資料(MWSystem)');
  }

  ngOnInit(): void {
    // 既定: 直近に終わった期（7/1〜6/30）
    const d = new Date();
    const y = d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    this.from = (y - 1) + '-07-01';
    this.to = y + '-06-30';
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges());
    this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    this.srv.stores().then(m => { this.storeNames = m; this.buildStores(); this.cdRef.detectChanges(); }).catch(() => undefined);
  }

  get pcodeList(): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn['pcode'] ?? []) as { value: string; viewval: string }[];
  }

  /** レートを手で変えた（空にしたら、次の集計で期末日のレートに戻す） */
  rateChanged() {
    this.rateFrom = this.rate == null ? '' : 'manual';
    this.buildStores();
  }

  togglePcode(v: string) {
    if (this.pcodes.has(v)) {
      this.pcodes.delete(v);
    } else {
      this.pcodes.add(v);
    }
  }

  async show() {
    if (!this.from || !this.to || this.from > this.to) {
      this.errors = { all: '期間を正しく入れてください' };
      return;
    }
    if (this.pcodes.size == 0) {
      this.errors = { all: '都度売掛の支払方法を 1 つ以上選んでください' };
      return;
    }
    this.busy = true;
    this.errors = {};
    this.cdRef.detectChanges();
    const from = this.from;
    const to = this.to;
    const pcodes = [...this.pcodes].sort((a, b) => Number(a) - Number(b));
    const run = async (key: string, f: () => Promise<void>) => {
      try {
        await f();
      } catch (e) {
        this.errors[key] = (e as Error).message;
        console.log('error repkessan ' + key, e);
      }
    };
    this.uri = []; this.urikake = []; this.tesu = []; this.zaiko = [];
    await Promise.all([
      run('uri', async () => { this.uri = await this.srv.uriage(from, to); }),
      run('urikake', async () => { this.urikake = await this.srv.urikake(from, to, pcodes); }),
      run('tesu', async () => { this.tesu = await this.srv.tesuryo(from, to); }),
      run('zaiko', async () => { this.zaiko = await this.srv.zaiko(to); })
    ]);
    this.shown = { from, to, pcodes };
    // 手で入れていなければ、期末日のレート（為替レートマスタ。無ければ空のまま）
    if (this.rateFrom != 'manual') {
      const r = await this.ratesrv.lookup('USD', to);
      this.rate = r;
      this.rateFrom = r == null ? '' : 'master';
    }
    this.buildUri();
    this.buildStores();
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 売上: 月ごとに 10% / 8% / 非課税 / 総合計、最後に期間の合計 */
  private buildUri() {
    const line = (label: string, kbn: string, rows: UriRow[], cnt: number | null, sum = false): UriLine => {
      const s = (k: keyof UriRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
      const sub = s('gtt') + s('neb') + s('sor') + s('tes');
      return { label, kbn, cnt, gtt: s('gtt'), neb: s('neb'), sor: s('sor'), tes: s('tes'), sub, tax: s('tax'), total: sub + s('tax'), sum };
    };
    const yms = [...new Set(this.uri.map(r => r.ym))].sort();
    const out: UriLine[] = [];
    for (const ym of yms) {
      const rows = this.uri.filter(r => r.ym == ym);
      const label = Number(ym.slice(5)) + '月';
      [0, 1, 2].forEach(k => out.push(line(k == 0 ? label : '', KBN_NAMES[k], rows.filter(r => r.kbn == k), k == 0 ? rows.reduce((a, r) => a + r.cnt, 0) : null)));
      out.push(line('', '総合計', rows, null, true));
    }
    if (yms.length > 0) {
      [0, 1, 2].forEach(k => out.push(line(k == 0 ? '合計' : '', KBN_NAMES[k], this.uri.filter(r => r.kbn == k), k == 0 ? this.uri.reduce((a, r) => a + r.cnt, 0) : null, true)));
      out.push(line('', '総合計', this.uri, null, true));
    }
    this.uriLines = out;
  }

  /** 在庫: 倉庫ごとの件数・円換算の合計（現行の Excel と同じく、単価×数量を円に丸めてから USD はレートを掛けて丸める） */
  buildStores() {
    const map = new Map<string, ZaikoRow[]>();
    this.zaiko.filter(r => (this.withEnd || !this.isEnd(r)) && r.zaiko < MUGEN).forEach(r => map.set(r.scode, [...(map.get(r.scode) ?? []), r]));
    this.stores = [...map.entries()].map(([scode, rows]) => ({
      scode, name: this.storeNames.get(scode) ?? scode, rows, count: rows.length,
      usd: rows.filter(r => this.isUsd(r)).reduce((a, r) => a + this.amount(r), 0),
      yen: rows.reduce((a, r) => a + this.yen(r), 0)
    }));
  }

  /** 中止・終了品か */
  isEnd(r: ZaikoRow): boolean {
    return (r.tkbn ?? '').trim() != '' && (r.tkbn ?? '').trim() != '0';
  }

  isUsd(r: ZaikoRow): boolean {
    return r.currency == 'USD';
  }

  /** 原価が USD なのに 1,000 ドル以上（円の原価を USD で登録している疑い） */
  isSuspect(r: ZaikoRow): boolean {
    return this.isUsd(r) && r.genka >= USD_SUSPECT;
  }

  /** 集計対象のうち、原価の通貨が怪しい商品（金額の大きい順） */
  get suspects(): (ZaikoRow & { name: string })[] {
    return this.stores.flatMap(s => s.rows.filter(r => this.isSuspect(r)).map(r => ({ ...r, name: s.name })))
      .sort((a, b) => this.amount(b) - this.amount(a));
  }

  /** 単価 × 数量（現行の H 列） */
  amount(r: ZaikoRow): number {
    return Math.round(r.zaiko * r.genka);
  }

  /** 円換算（現行の I 列） */
  yen(r: ZaikoRow): number {
    const a = this.amount(r);
    return this.isUsd(r) ? Math.round(a * (this.rate ?? 0)) : a;
  }

  get zaikoTotal(): number {
    return this.stores.reduce((a, s) => a + s.yen, 0);
  }

  get urikakeShown(): UrikakeRow[] {
    return this.withZero ? this.urikake : this.urikake.filter(r => r.zan != 0);
  }

  get urikakeTotal(): number {
    return this.urikake.reduce((a, r) => a + r.zan, 0);
  }

  get uriTotal(): number {
    return this.uriLines.length > 0 ? this.uriLines[this.uriLines.length - 1].total : 0;
  }

  /** 入金手数料: 月 × 入金方法の調整額 */
  get tesuMonths(): string[] {
    return [...new Set(this.tesu.map(r => r.day.slice(0, 7)))].sort();
  }

  get tesuTypes(): string[] {
    return [...new Set(this.tesu.map(r => r.ptype ?? ''))].sort();
  }

  tesuSum(ym: string | null, ptype: string | null): number {
    return this.tesu.filter(r => (ym == null || r.day.startsWith(ym)) && (ptype == null || (r.ptype ?? '') == ptype)).reduce((a, r) => a + r.tmoney, 0);
  }

  get tesuTotal(): number {
    return this.tesuSum(null, null);
  }

  kbnName(k: string, v: string | null): string {
    return v ? ((this.bunsrv.kbn[k] ?? []) as { value: string; viewval: string }[]).find(e => e.value == String(v).trim())?.viewval?.trim() ?? v : '';
  }

  staff(c: string | null): string {
    return c ? this.stfsrv.tcds.find(e => e.value == String(c).trim())?.viewval ?? c : '';
  }

  openSales(denno: number) {
    this.usrsrv.openMst('frmsales', String(denno));
  }

  async excel() {
    if (!this.shown) {
      return;
    }
    if (this.zaiko.some(r => this.isUsd(r)) && !this.rate) {
      this.errors = { ...this.errors, all: '在庫に USD の原価の商品があります。ドル円レートを入れてください' };
      this.cdRef.detectChanges();
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      fillKessanBook(wb, this);
      const buf = await excelBuffer(wb);
      const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      FileSaver.saveAs(new Blob([buf], { type }), '決算資料_' + this.shown.to.replace(/-/g, '') + '.xlsx');
    } catch (e) {
      this.errors = { ...this.errors, all: 'Excel を作成できませんでした：' + (e as Error).message };
      console.log('error repkessan excel', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
