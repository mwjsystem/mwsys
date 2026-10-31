import type { Cell, Workbook } from 'exceljs';
import type { HistOrder, HistRow } from './rephistory.service';

const HEAD_BG = 'FFE3EAF5';
const HIT_BG = 'FFFFF3C4';
const LINK = 'FF1565C0';

/** LST-HIST.xlsm の List シートと同じ列（最後の url は送り状番号のリンクに使う） */
const COLS: { label: string; width: number; get: (r: HistRow) => string | number | null; fmt?: string; date?: boolean }[] = [
  { label: '伝票番号', width: 10, get: r => r.denno },
  { label: '受付日', width: 11, get: r => r.day, date: true },
  { label: '出荷日', width: 11, get: r => r.sday, date: true },
  { label: '売上日', width: 11, get: r => r.uday, date: true },
  { label: '行番号', width: 7, get: r => r.line },
  { label: '商品コード', width: 16, get: r => r.gcode },
  { label: '商品名称', width: 32, get: r => r.gtext },
  { label: '数量', width: 7, get: r => r.suu == null ? null : Number(r.suu), fmt: '#,##0' },
  { label: '単位', width: 6, get: r => r.unit },
  { label: '金額', width: 11, get: r => r.money == null ? null : Number(r.money), fmt: '#,##0' },
  { label: '税', width: 5, get: r => r.mtax },
  { label: '掛率', width: 7, get: r => r.kkr == null ? null : Number(r.kkr), fmt: '0.00' },
  { label: '単価', width: 10, get: r => r.tanka == null ? null : Number(r.tanka), fmt: '#,##0' },
  { label: '税率', width: 6, get: r => r.taxrate },
  { label: '倉庫名', width: 12, get: r => r.soko },
  { label: '明細備考', width: 20, get: r => r.mmemo },
  { label: '受注方法', width: 12, get: r => r.jname },
  { label: '入金予定', width: 12, get: r => r.pname },
  { label: '受注先発注番号(Web受注番号)', width: 20, get: r => r.cusden },
  { label: '送り状', width: 14, get: r => r.hname },
  { label: '送り状番号', width: 16, get: r => r.okurino },
  { label: '個口', width: 6, get: r => r.okurisuu },
  { label: '配送希望', width: 11, get: r => r.hday, date: true },
  { label: '希望時間', width: 12, get: r => r.htime },
  { label: '受付先Cd', width: 10, get: r => r.mcode },
  { label: '納品先Cd', width: 8, get: r => r.nadr },
  { label: '納品先氏名', width: 24, get: r => r.adrname },
  { label: '内勤担当', width: 10, get: r => r.tnaikin },
  { label: '営業担当', width: 10, get: r => r.teigyo },
  { label: '大分類名', width: 14, get: r => r.dai },
  { label: '中分類名', width: 14, get: r => r.chu },
  { label: '小分類名', width: 14, get: r => r.sho },
  { label: '伝票備考', width: 24, get: r => r.dmemo },
  { label: '納品書備考', width: 24, get: r => r.nmemo },
  { label: '送り状備考', width: 24, get: r => r.omemo }
];
const COL_DENNO = 1;
const COL_OKURINO = 21;
/** 明細の列（商品コード〜明細備考） */
const COL_MEI_FROM = 6;
const COL_MEI_TO = 16;

/** 'YYYY-MM-DD' → Excel の日付（ExcelJS は UTC で書くので UTC で作る） */
function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function link(c: Cell, text: string, hyperlink: string) {
  c.value = { text, hyperlink };
  c.font = { color: { argb: LINK }, underline: true };
}

/**
 * List シートを作る。マクロと同じく伝票の 2 行目以降と明細の列をグループ化する。
 * 商品を指定したときは、該当の明細が見えるように開いたままにして色を付ける。
 */
export function fillHistBook(wb: Workbook, orders: HistOrder[], title: string, base: string, byGoods: boolean) {
  const ws = wb.addWorksheet('List', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  Object.assign(ws.properties, { outlineProperties: { summaryBelow: false, summaryRight: true } });
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true };
  COLS.forEach((col, i) => {
    const c = ws.getCell(2, i + 1);
    c.value = col.label;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
    c.border = { bottom: { style: 'thin' } };
    ws.getColumn(i + 1).width = col.width;
    if (i + 1 >= COL_MEI_FROM && i + 1 <= COL_MEI_TO) {
      ws.getColumn(i + 1).outlineLevel = 1;
      ws.getColumn(i + 1).hidden = !byGoods;
    }
  });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COLS.length } };
  let r = 3;
  for (const o of orders) {
    o.lines.forEach((l, li) => {
      const row = ws.getRow(r++);
      COLS.forEach((col, i) => {
        const v = col.get(l);
        const c = row.getCell(i + 1);
        if (col.date) {
          c.value = v ? toDate(String(v)) : null;
          c.numFmt = 'yyyy/m/d';
        } else {
          c.value = v;
          if (col.fmt) {
            c.numFmt = col.fmt;
          }
        }
        if (l.hit) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIT_BG } };
        }
      });
      if (li == 0) {
        link(row.getCell(COL_DENNO), String(l.denno), base + '/frmsales/3/' + l.denno);
        if (l.okurino && l.url) {
          link(row.getCell(COL_OKURINO), l.okurino, l.url + l.okurino);
        }
      } else {
        row.outlineLevel = 1;
        row.hidden = !byGoods;
      }
    });
  }
}
