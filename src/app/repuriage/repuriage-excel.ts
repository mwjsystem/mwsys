import type { Cell, Row, Workbook, Worksheet } from 'exceljs';
import type { Mode, Node, PersBlock, Val } from './repuriage.service';

/** Excel に出す内容（画面の RepuriageComponent が持っている値） */
export interface UriSource {
  mode: Mode;
  columns: { key: string; label: string }[];
  root?: Node;
  /** 閉じている行も含めたすべての行 */
  allRows: Node[];
  persCols: string[];
  persBlocks: PersBlock[];
  years: number[];
  months: number[];
  totalTarget: number;
  val(n: Node, col: string): Val;
  ratio(v: Val): number | null;
  cum(n: Node): Val;
  target(n: Node): number | null;
  daily(t: number | null): number | null;
  ym(y: number, m: number): number;
  yearTotal(y: number): number;
}

const NUM = '#,##0';
const PCT = '0.0%';
const RED = 'FFC62828';
const HEAD_BG = 'FFE0E0E0';
const TOTAL_BG = 'FFF0F0F0';

interface CellOpt { fmt?: string; bold?: boolean; red?: boolean }

function put(cell: Cell, v: number | string | null | undefined, opt: CellOpt = {}) {
  cell.value = v ?? null;
  if (opt.fmt) {
    cell.numFmt = opt.fmt;
  }
  if (opt.bold || opt.red) {
    cell.font = { bold: !!opt.bold, ...(opt.red ? { color: { argb: RED } } : {}) };
  }
}

function headRow(row: Row, labels: string[]) {
  labels.forEach((label, i) => {
    const c = row.getCell(i + 1);
    c.value = label || null;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
    c.border = { bottom: { style: 'thin' } };
  });
}

function totalFill(row: Row, cols: number) {
  for (let i = 1; i <= cols; i++) {
    row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
  }
}

/** 名称の列に階層を字下げで出し、Excel のグループ化で畳めるようにする */
function nameCell(row: Row, n: Node) {
  const c = row.getCell(1);
  put(c, n.label, { bold: n.level == 0 });
  c.alignment = { indent: Math.max(n.level, 0) };
  row.outlineLevel = Math.max(n.level, 0);
}

function sheet(wb: Workbook, name: string, xSplit: number, ySplit: number): Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit, ySplit }] });
  Object.assign(ws.properties, { outlineProperties: { summaryBelow: false } });
  return ws;
}

function titleRows(ws: Worksheet, title: string, info: string) {
  put(ws.getCell(1, 1), title, { bold: true });
  put(ws.getCell(2, 1), info);
}

function sheetUriage(wb: Workbook, s: UriSource, title: string, info: string) {
  const ws = sheet(wb, '売上報告', 1, 4);
  titleRows(ws, title, info);
  const colCnt = 1 + s.columns.length * 3;
  headRow(ws.getRow(3), ['名称', ...s.columns.flatMap(c => [c.label, '', ''])]);
  headRow(ws.getRow(4), ['', ...s.columns.flatMap(() => ['実績額', '昨年額', '昨対'])]);
  ws.mergeCells(3, 1, 4, 1);
  s.columns.forEach((_, i) => ws.mergeCells(3, 2 + i * 3, 3, 4 + i * 3));
  const line = (row: Row, n: Node, bold: boolean) => {
    s.columns.forEach((c, i) => {
      const v = s.val(n, c.key);
      const r = s.ratio(v);
      put(row.getCell(2 + i * 3), v.jis, { fmt: NUM, bold });
      put(row.getCell(3 + i * 3), v.sak, { fmt: NUM, bold });
      put(row.getCell(4 + i * 3), r, { fmt: PCT, bold, red: r != null && r < 1 });
    });
  };
  let r = 5;
  for (const n of s.allRows) {
    const row = ws.getRow(r++);
    nameCell(row, n);
    line(row, n, n.level == 0);
  }
  if (s.root) {
    const row = ws.getRow(r++);
    put(row.getCell(1), '総計', { bold: true });
    line(row, s.root, true);
    totalFill(row, colCnt);
  }
  // 年別の実績
  r++;
  put(ws.getCell(r++, 1), '年別の実績（1〜12 月）', { bold: true });
  headRow(ws.getRow(r++), ['年', '年間合計', ...s.months.map(m => m + '月')]);
  for (const y of s.years) {
    const row = ws.getRow(r++);
    put(row.getCell(1), y + '年');
    put(row.getCell(2), s.yearTotal(y), { fmt: NUM });
    s.months.forEach((m, i) => put(row.getCell(3 + i), s.ym(y, m), { fmt: NUM }));
  }
  ws.getColumn(1).width = 30;
  for (let i = 2; i <= colCnt; i++) {
    ws.getColumn(i).width = 13;
  }
}

function sheetPers(wb: Workbook, s: UriSource, title: string, info: string) {
  const ws = sheet(wb, '個人集計', 3, 4);
  titleRows(ws, title, info);
  put(ws.getCell(3, 1), '※送料を除いた商品売上のみ集計。');
  headRow(ws.getRow(4), ['担当', '項目', '区分', ...s.persCols, '当日までの累計']);
  let r = 5;
  for (const b of s.persBlocks) {
    b.lines.forEach((l, li) => {
      const row = ws.getRow(r++);
      const fmt = l.pct ? PCT : NUM;
      const red = (v: number | null) => !l.pct && v != null && v < 0;
      if (li == 0) {
        put(row.getCell(1), b.item.tanto);
        put(row.getCell(2), b.item.item + (b.item.kind == 'G' && !b.item.val ? '（条件未設定）' : ''));
        for (let i = 1; i <= s.persCols.length + 4; i++) {
          row.getCell(i).border = { top: { style: 'thin' } };
        }
      }
      put(row.getCell(3), l.label);
      l.cells.forEach((v, i) => put(row.getCell(4 + i), v, { fmt, red: red(v) }));
      put(row.getCell(4 + l.cells.length), l.total, { fmt, red: red(l.total) });
    });
  }
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 9;
  for (let i = 4; i <= s.persCols.length + 4; i++) {
    ws.getColumn(i).width = 13;
  }
}

function sheetCum(wb: Workbook, s: UriSource, title: string, info: string) {
  const ws = sheet(wb, '累計値', 1, 4);
  const tanto = s.mode == 'tanto';
  titleRows(ws, title, info);
  put(ws.getCell(3, 1), '前年 12 月〜対象日までの累計。粗利は受注明細の原価（みなし原価の商品は売上 × 率）で計算しています。');
  const heads = ['名称', '累計実績額', '昨年累計額', '昨対', '粗利', '粗利率', ...(tanto ? ['年間目標額', '年間日割額', '実績－日割目標'] : [])];
  headRow(ws.getRow(4), heads);
  const line = (row: Row, n: Node, t: number | null, bold: boolean) => {
    const v = s.cum(n);
    const rt = s.ratio(v);
    put(row.getCell(2), v.jis, { fmt: NUM, bold });
    put(row.getCell(3), v.sak, { fmt: NUM, bold });
    put(row.getCell(4), rt, { fmt: PCT, bold, red: rt != null && rt < 1 });
    put(row.getCell(5), v.ara, { fmt: NUM, bold });
    put(row.getCell(6), v.jis ? v.ara / v.jis : null, { fmt: PCT, bold });
    if (tanto) {
      const d = s.daily(t);
      const diff = t != null ? v.jis - (d ?? 0) : null;
      put(row.getCell(7), t, { fmt: NUM, bold });
      put(row.getCell(8), d, { fmt: NUM, bold });
      put(row.getCell(9), diff, { fmt: NUM, bold, red: diff != null && diff < 0 });
    }
  };
  let r = 5;
  for (const n of s.allRows) {
    const row = ws.getRow(r++);
    nameCell(row, n);
    line(row, n, s.target(n), n.level == 0);
  }
  if (s.root) {
    const row = ws.getRow(r++);
    put(row.getCell(1), '総計', { bold: true });
    line(row, s.root, s.totalTarget, true);
    totalFill(row, heads.length);
  }
  ws.getColumn(1).width = 30;
  for (let i = 2; i <= heads.length; i++) {
    ws.getColumn(i).width = 15;
  }
}

/** 売上報告・個人集計・累計値の 3 シートを作る */
export function fillUriBook(wb: Workbook, s: UriSource, title: string, info: string) {
  sheetUriage(wb, s, title, info);
  sheetPers(wb, s, title, info);
  sheetCum(wb, s, title, info);
}
