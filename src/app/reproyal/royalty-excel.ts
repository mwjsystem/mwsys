import type { Workbook, Worksheet, Cell, Borders } from 'exceljs';
import type { RoyOrg } from './royalty.service';

/** 弊社の住所など（明細書の右上） */
export const MW_INFO = ['〒541-0051 大阪府大阪市中央区備後町3-1-6 船場アルファビル2F', '㈱マーシャルワールドジャパン', 'TEL：06-4963-2224', 'FAX：06-4963-2229'];
export const NUM = '#,##0';
export const NUM1 = '#,##0.#';

/** セルに入れる値（f は数式。v はその計算結果） */
export type XVal = string | number | null | undefined | Date | { f: string; v?: number | null };

const THIN: Partial<Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
};

/** 列番号 → 列名（1 → A） */
export const colName = (c: number): string => {
  let s = '';
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
};
/** セルの番地（行・列 → A1） */
export const at = (r: number, c: number): string => colName(c) + r;

/** 数式の値を、計算結果つきで作る */
export const fx = (f: string, v?: number | null): XVal => ({ f, v: v ?? null });

/** セルに値を入れる */
export function put(ws: Worksheet, r: number, c: number, v: XVal, fmt?: string): Cell {
  const cell = ws.getCell(r, c);
  if (v != null && typeof v == 'object' && !(v instanceof Date)) {
    cell.value = v.v == null ? { formula: v.f, date1904: false } as never : { formula: v.f, result: v.v, date1904: false } as never;
  } else {
    cell.value = v ?? null;
  }
  if (fmt) {
    cell.numFmt = fmt;
  } else if (typeof v == 'number' || (v != null && typeof v == 'object' && !(v instanceof Date))) {
    cell.numFmt = NUM;
  }
  return cell;
}

/** 範囲に罫線を引く */
export function box(ws: Worksheet, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r, c).border = THIN;
    }
  }
}

/** 範囲を太字にし、背景を薄い灰色にする（表の見出し） */
export function head(ws: Worksheet, r: number, c1: number, c2: number) {
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(r, c);
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  }
}

/** 列の幅 */
export function widths(ws: Worksheet, w: number[]) {
  w.forEach((v, i) => ws.getColumn(i + 1).width = v);
}

/** 結合して値を入れる */
export function merge(ws: Worksheet, r1: number, c1: number, r2: number, c2: number, v: XVal, fmt?: string): Cell {
  if (r1 != r2 || c1 != c2) {
    ws.mergeCells(r1, c1, r2, c2);
  }
  return put(ws, r1, c1, v, fmt);
}

/** 日付を「2026年10月」にする */
export const ymText = (y: number, m: number): string => y + '年' + m + '月';

/** 明細書の上の部分（タイトル・作成日・宛先・登録番号・弊社の住所）。次に書ける行を返す */
export function letterHead(ws: Worksheet, title: string, org: RoyOrg, lastCol: number, dest?: string | null): number {
  merge(ws, 1, 1, 1, lastCol, title).font = { bold: true, size: 16 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };
  const today = new Date();
  put(ws, 2, lastCol, today, 'yyyy/m/d').alignment = { horizontal: 'right' };
  const lines = (dest ?? org.dest ?? '').split('\n');
  lines.forEach((t, i) => {
    const c = put(ws, 3 + i, 1, t);
    c.font = { size: 13, bold: true, underline: i == lines.length - 1 };
  });
  let r = 3 + lines.length;
  if (org.regno) {
    put(ws, r, 1, org.regno);
    r++;
  }
  MW_INFO.forEach((t, i) => put(ws, 3 + i, lastCol, t).alignment = { horizontal: 'right' });
  return Math.max(r, 3 + MW_INFO.length) + 1;
}

/** 挨拶文（結合して折り返す）。次に書ける行を返す */
export function greet(ws: Worksheet, r: number, org: RoyOrg, lastCol: number): number {
  if (!org.greet) {
    return r;
  }
  const n = org.greet.split('\n').length;
  const c = merge(ws, r, 1, r + n - 1, lastCol, org.greet);
  c.alignment = { wrapText: true, vertical: 'top' };
  return r + n + 1;
}

/** 振込先・支払方法と確認印・担当者の欄。次に書ける行を返す */
export function footer(ws: Worksheet, r: number, org: RoyOrg, lastCol: number, label = '振込先', bank?: string | null): number {
  const lines = (bank ?? org.bank ?? '').split('\n').filter(e => e);
  if (lines.length > 0) {
    put(ws, r, 1, label).font = { bold: true };
    lines.forEach((t, i) => put(ws, r + i, 2, t));
  }
  put(ws, r, lastCol - 1, '確認印');
  put(ws, r, lastCol, '担当者');
  box(ws, r, lastCol - 1, r + 2, lastCol);
  if (org.tanto) {
    put(ws, r + 2, lastCol, org.tanto).alignment = { horizontal: 'center' };
  }
  return r + Math.max(lines.length, 3) + 1;
}

/** 上の合計の欄（見出しの行と値の行） */
export function summary(ws: Worksheet, r: number, cells: { c: number; c2?: number; label: string; v: XVal; fmt?: string }[]) {
  for (const e of cells) {
    merge(ws, r, e.c, r, e.c2 ?? e.c, e.label);
    merge(ws, r + 1, e.c, r + 1, e.c2 ?? e.c, e.v, e.fmt);
    head(ws, r, e.c, e.c2 ?? e.c);
    box(ws, r, e.c, r + 1, e.c2 ?? e.c);
  }
  ws.getRow(r).height = 30;
}

/** 表（見出し・行）を書く。行は 1 行ずつの値の配列（行番号を受け取って作る）。最後の行の番号を返す */
export function table(ws: Worksheet, r: number, c: number, heads: string[], rows: ((r: number) => XVal[])[], fmts: (string | undefined)[] = []): number {
  heads.forEach((h, i) => put(ws, r, c + i, h));
  head(ws, r, c, c + heads.length - 1);
  rows.forEach((row, i) => row(r + 1 + i).forEach((v, j) => put(ws, r + 1 + i, c + j, v, fmts[j])));
  const last = r + rows.length;
  box(ws, r, c, Math.max(last, r), c + heads.length - 1);
  return last;
}

/** 印刷の設定（A4 縦・1 ページの幅に合わせる） */
export function printFit(ws: Worksheet, landscape = false) {
  ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
}

/** 新しいシート */
export function sheet(wb: Workbook, name: string): Worksheet {
  // シート名に使えない文字を置き換え、31 文字までにする
  const safe = name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  let n = safe;
  let i = 2;
  while (wb.getWorksheet(n)) {
    n = safe.slice(0, 28) + '(' + i++ + ')';
  }
  return wb.addWorksheet(n);
}
