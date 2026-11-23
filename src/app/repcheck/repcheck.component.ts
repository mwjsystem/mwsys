import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { DecimalPipe } from '@angular/common';
import * as FileSaver from 'file-saver';
import type { Workbook, Worksheet } from 'exceljs';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { StaffService } from './../services/staff.service';
import { RepkessanService } from './../repkessan/repkessan.service';
import { RepcheckService, SalesRow, lastMonths } from './repcheck.service';
import { HacchuItem, HacchuRow, fillHacchuBook, fillSalesBook, fillStoreBook, salesPivot } from './repcheck-excel';

const MAIN_SCODE = '01';
/** これより前の発注は古い移行データなので見ない（現行と同じ） */
const HATZN_FROM = '2019-06-28';

/** 残少・在庫切れの 1 行 */
interface ShortRow { gcode: string; gtext: string; zaiko: number; juzan: number; syuk: number }
/** 倉庫ごとの在庫 */
interface StoreStock { scode: string; name: string; rows: { gcode: string; gtext: string; zaiko: number }[] }

const ymd = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const text = (v: unknown): string => {
  if (v == null) {
    return '';
  }
  if (typeof v == 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) {
      return o.richText.map(t => t.text).join('').trim();
    }
    return String(o.result ?? o.text ?? '').trim();
  }
  return String(v).trim();
};

/**
 * 在庫・発注チェック（現行の 国内発注在庫.xlsm・残少在庫確認.xlsm・大会倉庫.xlsm・竹島さん売上.xlsm の画面版）。
 * 毎日・毎月の送信はバッチ（batch/zaiko/reportjob.py）が行い、この画面ではその場で確かめて Excel に出す。
 */
@Component({
  selector: 'app-repcheck',
  templateUrl: './repcheck.component.html',
  styleUrls: ['./repcheck.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIcon, MatTabGroup, MatTab, FormsModule, DecimalPipe]
})
export class RepcheckComponent implements OnInit {
  private srv = inject(RepcheckService);
  private kessrv = inject(RepkessanService);
  stfsrv = inject(StaffService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  busy = false;
  errors: Record<string, string> = {};

  // ---- 発注点（国内発注在庫）
  hFile = '';
  hItems: HacchuItem[] = [];
  hYms: string[] = [];
  hRows: HacchuRow[] = [];
  hOnlyAlert = false;

  // ---- 残少在庫・在庫切れ（朝来）
  zDay = ymd(new Date());
  zMax = 5;
  zansho: ShortRow[] = [];
  kireru: ShortRow[] = [];
  zShown = false;

  // ---- 大会倉庫
  storeNames = new Map<string, string>();
  tStores = new Set<string>();
  tShown: StoreStock[] = [];

  // ---- 営業担当の売上
  sTcode = '3107';
  sFrom = '';
  sTo = '';
  sales: SalesRow[] = [];
  sShown?: { tcode: string; from: string; to: string };
  sPivot: ReturnType<typeof salesPivot> = { yms: [], data: [] };

  constructor() {
    this.title.setTitle('在庫・発注チェック(MWSystem)');
  }

  ngOnInit(): void {
    const t = new Date();
    this.sFrom = ymd(new Date(t.getFullYear() - 3, t.getMonth(), 1));
    this.sTo = ymd(new Date(t.getFullYear(), t.getMonth(), 0));
    this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    this.kessrv.stores().then(m => {
      this.storeNames = m;
      // 大会倉庫（5 で始まる 3 桁の倉庫）を最初から選んでおく
      [...m.keys()].filter(c => /^5\d\d$/.test(c)).forEach(c => this.tStores.add(c));
      this.cdRef.detectChanges();
    }).catch(() => undefined);
  }

  get storeList(): { code: string; name: string }[] {
    return [...this.storeNames.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code < b.code ? -1 : 1);
  }

  private async work(key: string, f: () => Promise<void>) {
    this.busy = true;
    this.errors = { ...this.errors, [key]: '' };
    this.cdRef.detectChanges();
    try {
      await f();
    } catch (e) {
      this.errors = { ...this.errors, [key]: (e as Error).message };
      console.log('error repcheck ' + key, e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  private async save(name: string, fill: (wb: Workbook) => void) {
    const lib = await loadExcelJs();
    const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
    const wb = new ExcelJS.Workbook();
    fill(wb);
    const buf = await excelBuffer(wb);
    FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  }

  // ================================================================ 発注点

  /** 国内発注在庫.xlsm の発注一覧シート（3 行目から、A 列が空になるまで）を読む */
  async onHacchuFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) {
      return;
    }
    await this.work('hacchu', async () => {
      const lib = await loadExcelJs();
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const ws: Worksheet | undefined = wb.getWorksheet('発注一覧');
      if (!ws) {
        throw new Error(f.name + ' に「発注一覧」シートがありません');
      }
      const items: HacchuItem[] = [];
      for (let r = 3; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const gcode = text(row.getCell(1).value);
        if (!gcode) {
          break;
        }
        items.push({ gcode, gtext: text(row.getCell(2).value), lot: row.getCell(16).value, vcode: text(row.getCell(17).value),
          vname: text(row.getCell(18).value), memo: text(row.getCell(23).value) });
      }
      this.hFile = f.name;
      this.hItems = items;
      await this.calcHacchu();
    });
  }

  async reloadHacchu() {
    await this.work('hacchu', () => this.calcHacchu());
  }

  /** 発注点（12 か月の出荷の月平均 × 1.2）・受注可・発注残。バッチ hacchu と同じ計算 */
  private async calcHacchu() {
    const { from, to, yms } = lastMonths(new Date());
    const today = ymd(new Date());
    const [syuk, stock, hatzn] = await Promise.all([this.srv.syukMonth(from, to, ''), this.srv.stock(today, [MAIN_SCODE]), this.srv.hatzn(MAIN_SCODE)]);
    const st = new Map(stock.map(s => [s.gcode, s]));
    const total = new Map<string, number>();
    hatzn.forEach(h => total.set(h.gcode, (total.get(h.gcode) ?? 0) + h.hatzn));
    this.hYms = yms;
    this.hRows = this.hItems.map(it => {
      const months = yms.map(ym => syuk.get(it.gcode)?.get(ym) ?? 0);
      const point = Math.round(months.reduce((a, v) => a + v, 0) / 12 * 1.2 * 10) / 10;
      const s = st.get(it.gcode);
      const zaiko = s?.zaiko ?? 0;
      const juzan = s?.juzan ?? 0;
      const zan = total.get(it.gcode) ?? 0;
      const orders = hatzn.filter(h => h.gcode == it.gcode && h.vcode == it.vcode && h.day >= HATZN_FROM)
        .sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : b.denno - a.denno).slice(0, 5)
        .map(h => ({ day: h.day, denno: h.denno, hatzn: h.hatzn }));
      return { ...it, months, point, zaiko, juzan, kano: zaiko - juzan, zan, orders, alert: zaiko - juzan + zan < point };
    });
  }

  get hShown(): HacchuRow[] {
    return this.hOnlyAlert ? this.hRows.filter(r => r.alert) : this.hRows;
  }

  get hAlertCount(): number {
    return this.hRows.filter(r => r.alert).length;
  }

  async hacchuExcel() {
    await this.work('hacchu', () => this.save('国内発注在庫_' + ymd(new Date()).replace(/-/g, '') + '.xlsx', wb => fillHacchuBook(wb, this.hRows, this.hYms)));
  }

  // ================================================================ 残少在庫・在庫切れ

  async showZansho() {
    await this.work('zansho', async () => {
      const [shipped, stock] = await Promise.all([this.srv.syukDay(this.zDay, MAIN_SCODE), this.srv.stock(this.zDay, [MAIN_SCODE])]);
      const st = new Map(stock.map(s => [s.gcode, s]));
      // 在庫切れ: 在庫 ≦ 受注残（受注残のあるもの）。中止品・在庫管理しない商品は除く
      const kire = stock.filter(s => s.juzan > 0 && s.zaiko <= s.juzan);
      const goods = await this.srv.goods([...new Set([...shipped.keys(), ...kire.map(s => s.gcode)])]);
      const name = (g: string) => goods.get(g)?.gtext ?? '';
      this.zansho = [...shipped.entries()]
        .map(([g, suu]) => ({ gcode: g, gtext: name(g), zaiko: st.get(g)?.zaiko ?? 0, juzan: st.get(g)?.juzan ?? 0, syuk: suu }))
        .filter(r => r.zaiko <= this.zMax).sort((a, b) => a.gcode < b.gcode ? -1 : 1);
      const live = (g: string) => ['', '0'].includes(goods.get(g)?.tkbn ?? '') && ['', '0'].includes(goods.get(g)?.zkbn ?? '');
      this.kireru = kire.filter(s => live(s.gcode))
        .map(s => ({ gcode: s.gcode, gtext: name(s.gcode), zaiko: s.zaiko, juzan: s.juzan, syuk: shipped.get(s.gcode) ?? 0 }))
        .sort((a, b) => a.gcode < b.gcode ? -1 : 1);
      this.zShown = true;
    });
  }

  // ================================================================ 大会倉庫

  toggleStore(c: string) {
    if (this.tStores.has(c)) {
      this.tStores.delete(c);
    } else {
      this.tStores.add(c);
    }
  }

  async showTaikai() {
    if (this.tStores.size == 0) {
      this.errors = { ...this.errors, taikai: '倉庫を 1 つ以上選んでください' };
      return;
    }
    await this.work('taikai', async () => {
      const scodes = [...this.tStores].sort();
      const stock = (await this.srv.stock(ymd(new Date()), scodes)).filter(s => s.zaiko > 0);
      const goods = await this.srv.goods([...new Set(stock.map(s => s.gcode))]);
      this.tShown = scodes.map(sc => ({
        scode: sc, name: this.storeNames.get(sc) ?? sc,
        rows: stock.filter(s => s.scode == sc).sort((a, b) => a.gcode < b.gcode ? -1 : 1).map(s => ({ gcode: s.gcode, gtext: goods.get(s.gcode)?.gtext ?? '', zaiko: s.zaiko }))
      }));
    });
  }

  async taikaiExcel() {
    await this.work('taikai', () => this.save('大会倉庫在庫_' + ymd(new Date()).replace(/-/g, '') + '.xlsx', wb => fillStoreBook(wb, this.tShown)));
  }

  // ================================================================ 営業担当の売上

  staffName(c: string): string {
    return this.stfsrv.tcds.find(e => e.value == String(c).trim())?.viewval ?? c;
  }

  async showSales() {
    if (!this.sTcode || !this.sFrom || !this.sTo || this.sFrom > this.sTo) {
      this.errors = { ...this.errors, sales: '営業担当と期間を正しく入れてください' };
      return;
    }
    await this.work('sales', async () => {
      this.sales = await this.srv.sales(this.sFrom, this.sTo, this.sTcode);
      this.sPivot = salesPivot(this.sales);
      this.sShown = { tcode: this.sTcode, from: this.sFrom, to: this.sTo };
    });
  }

  get salesTotal(): number {
    return this.sales.reduce((a, r) => a + r.kingaku, 0);
  }

  async salesExcel() {
    const s = this.sShown;
    if (!s) {
      return;
    }
    const tname = this.staffName(s.tcode);
    await this.work('sales', () => this.save(tname + 'さん売上_' + s.to.replace(/-/g, '') + '.xlsx', wb => fillSalesBook(wb, this.sales, tname, s.from)));
  }
}
