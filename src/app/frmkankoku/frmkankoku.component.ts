import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { DecimalPipe } from '@angular/common';
import * as FileSaver from 'file-saver';
import type { Workbook, Worksheet } from 'exceljs';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { RepcheckService } from './../repcheck/repcheck.service';
import { KankokuService, OrderLine, OrderSlip, DMEMO_PREFIX } from './kankoku.service';
import {
  Calc, KakoItem, PreviewRow, SheetItem, HATZN_FROM, KANTO_SCODE, MAIN_ZAIKO_SCODES,
  buildCalc, dataRows, monthRange, preview, splitCode, ymBefore
} from './kankoku-calc';

const ymd = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const text = (v: unknown): string => {
  if (v == null) {
    return '';
  }
  if (v instanceof Date) {
    return ymd(v);
  }
  if (typeof v == 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) {
      return o.richText.map(t => t.text).join('').trim();
    }
    return text(o.result ?? o.text ?? '');
  }
  return String(v).trim();
};
/** yyyymmdd（文字・数値）や日付のセルを yyyy-mm-dd に */
const cellDay = (v: unknown): string => {
  const s = text(v).replace(/[/.]/g, '-');
  if (/^\d{8}$/.test(s)) {
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

/**
 * 発注勧告（現行の【原本】YYYY年MM月発注勧告.xlsm の置き換え）。
 * 1. Span マクロが旧システムの DB から読んでいた値を「発注勧告データ.xlsx」に出す（マクロは batch/hatkankoku/Module1.bas）
 * 2. data シート（Make_data の結果）から発注伝票を登録する（現行の 発注取込.csv の置き換え）
 */
@Component({
  selector: 'app-frmkankoku',
  templateUrl: './frmkankoku.component.html',
  styleUrls: ['./frmkankoku.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIcon, FormsModule, DecimalPipe]
})
export class FrmkankokuComponent {
  private srv = inject(KankokuService);
  private chksrv = inject(RepcheckService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  busy = false;
  error = '';
  oError = '';

  fileName = '';
  /** 基準日（現行の発注シートの C1。マクロはこの日の前月の出荷数、6 か月前〜前月の発注数を書く） */
  baseDay = ymd(new Date());
  items: SheetItem[] = [];
  kako: KakoItem[] = [];
  orderLines: OrderLine[] = [];

  months: string[] = [];
  calcDay = '';
  rows: PreviewRow[] = [];
  private calc?: Calc;

  slips: OrderSlip[] = [];
  slipErrors: string[] = [];
  made: { denno: number; day: string; vcode: string }[] = [];
  force = false;
  done: { denno: number; vcode: string }[] = [];

  constructor() {
    this.title.setTitle('発注勧告(MWSystem)');
  }

  private async work(f: () => Promise<void>, key: 'error' | 'oError' = 'error') {
    this.busy = true;
    this[key] = '';
    this.cdRef.detectChanges();
    try {
      await f();
    } catch (e) {
      this[key] = (e as Error).message;
      console.log('error frmkankoku', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 発注勧告.xlsm の 発注・加工品・data シートを読む */
  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) {
      return;
    }
    await this.work(async () => {
      const lib = await loadExcelJs();
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const sheet = (name: string): Worksheet => {
        const ws = wb.getWorksheet(name);
        if (!ws) {
          throw new Error(f.name + ' に「' + name + '」シートがありません');
        }
        return ws;
      };
      // 発注シート: 3 行目から、品名（C 列）が空になるまで。内外（F）が 海外 で、E が OEM でない行（Span マクロと同じ）
      const ws = sheet('発注');
      const items: SheetItem[] = [];
      for (let r = 3; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        if (!text(row.getCell(3).value)) {
          break;
        }
        const code = text(row.getCell(2).value);
        if (!code || text(row.getCell(6).value) != '海外' || text(row.getCell(5).value) == 'OEM') {
          continue;
        }
        items.push({ row: r, code, ...splitCode(code), gtext: text(row.getCell(3).value), vname: text(row.getCell(18).value) });
      }
      // 加工品シート: 2 行目から、追加元（A 列）が空になるまで
      const kws = sheet('加工品');
      const kako: KakoItem[] = [];
      for (let r = 2; r <= kws.rowCount; r++) {
        const from = text(kws.getRow(r).getCell(1).value);
        if (!from) {
          break;
        }
        kako.push({ from, to: text(kws.getRow(r).getCell(2).value) });
      }
      // data シート: 2 行目から、商品（D 列）が空になるまで
      const dws = sheet('data');
      const lines: OrderLine[] = [];
      for (let r = 2; r <= dws.rowCount; r++) {
        const row = dws.getRow(r);
        const code = text(row.getCell(4).value);
        if (!code) {
          break;
        }
        const { gcode, grp } = splitCode(code);
        const vc = text(row.getCell(3).value);
        lines.push({
          row: r, day: cellDay(row.getCell(1).value), yday: cellDay(row.getCell(2).value),
          vcode: /^\d+$/.test(vc) ? vc.padStart(6, '0') : vc, code, gcode, scode: grp == '016' ? KANTO_SCODE : '01',
          suu: Number(text(row.getCell(5).value)) || 0
        });
      }
      this.fileName = f.name;
      this.items = items;
      this.kako = kako;
      this.orderLines = lines;
      this.done = [];
      this.force = false;
      await this.recalc();
      await this.loadSlips();
    });
  }

  async reload() {
    await this.work(() => this.recalc());
  }

  /** DB の値を読み、Span マクロの関数ごとにまとめる */
  private async recalc() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.baseDay)) {
      throw new Error('基準日を入れてください');
    }
    const lastYm = ymBefore(this.baseDay, 1);
    const months = [6, 5, 4, 3, 2, 1].map(n => ymBefore(this.baseDay, n));
    const { from, to } = monthRange(lastYm);
    const [stock, syuk, hatz] = await Promise.all([
      this.chksrv.stock(this.baseDay, [...MAIN_ZAIKO_SCODES, KANTO_SCODE]),
      this.srv.syuk(from, to),
      this.srv.hatz(HATZN_FROM)
    ]);
    this.calc = buildCalc(stock, syuk, hatz, months);
    this.months = months;
    this.calcDay = this.baseDay;
    this.rows = preview(this.items, this.kako, this.calc, months);
  }

  /** データ.xlsx に出す商品（発注シートの対象の品番と、加工品の追加元） */
  get targetCodes(): string[] {
    return [...new Set([...this.items.map(i => i.gcode), ...this.kako.map(k => k.from)])].sort();
  }

  async dataExcel() {
    const c = this.calc;
    if (!c) {
      return;
    }
    await this.work(async () => {
      const lib = await loadExcelJs();
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      const wb: Workbook = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('値');
      ws.addRow(['基準日', this.calcDay.replace(/-/g, ''), '発注勧告の Span マクロ（Module1）が読むファイルです。列を変えないでください']);
      ws.addRow(['種類', '商品コード', 'キー', '値', '値2']);
      dataRows(this.targetCodes, c, this.months).forEach(r => ws.addRow([r.kind, r.gcode, r.key, r.v1, r.v2]));
      ws.getColumn(2).width = 20;
      ws.getColumn(3).width = 12;
      const buf = await excelBuffer(wb);
      FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        '発注勧告データ_' + this.calcDay.replace(/-/g, '') + '.xlsx');
    });
  }

  // ================================================================ 発注伝票

  /** data シートの行を発注伝票にまとめ、同じ発注日に作った伝票が無いか確かめる */
  private async loadSlips() {
    const bad = this.orderLines.filter(l => !l.day || !l.vcode || l.suu <= 0);
    const ok = this.orderLines.filter(l => !bad.includes(l));
    const { slips, errors } = await this.srv.slips(ok);
    this.slips = slips;
    this.slipErrors = [...bad.map(l => l.row + ' 行目: 発注日・仕入先コード・数量のどれかがありません（' + l.code + '）'), ...errors];
    const days = [...new Set(slips.map(s => s.day))];
    this.made = days.length ? await this.srv.madeOn(days) : [];
  }

  get slipTotal(): { lines: number; suu: number } {
    return this.slips.reduce((a, s) => ({ lines: a.lines + s.lines.length, suu: a.suu + s.lines.reduce((b, l) => b + l.suu, 0) }), { lines: 0, suu: 0 });
  }

  lineSum(s: OrderSlip): number {
    return s.lines.reduce((a, l) => a + l.suu, 0);
  }

  get canRegister(): boolean {
    return !this.busy && this.slips.length > 0 && this.slipErrors.length == 0 && this.done.length == 0 && (this.made.length == 0 || this.force);
  }

  async register() {
    if (!this.canRegister) {
      return;
    }
    if (!confirm('発注伝票を ' + this.slips.length + ' 枚（' + this.slipTotal.lines + ' 行）登録します。よろしいですか？')) {
      return;
    }
    await this.work(async () => {
      this.done = await this.srv.register(this.slips, DMEMO_PREFIX);
    }, 'oError');
  }
}
