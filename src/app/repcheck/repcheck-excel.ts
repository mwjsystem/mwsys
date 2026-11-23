import type { Workbook, Worksheet } from 'exceljs';
import type { SalesRow } from './repcheck.service';

/** 発注一覧（国内発注在庫.xlsm の発注一覧シート）の 1 商品 */
export interface HacchuItem { gcode: string; gtext: string; lot: unknown; vcode: string; vname: string; memo: string }
/** 発注点の計算結果 */
export interface HacchuRow extends HacchuItem {
  months: number[]; point: number; zaiko: number; juzan: number; kano: number; zan: number;
  orders: { day: string; denno: number; hatzn: number }[]; alert: boolean;
}

const HEAD_BG = 'FFE0E0E0';

function head(ws: Worksheet, row: number, values: string[]) {
  const r = ws.getRow(row);
  values.forEach((v, i) => {
    const c = r.getCell(i + 1);
    c.value = v;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
  });
}

/** 発注一覧の結果（バッチ hacchu の結果ファイルと同じ並び） */
export function fillHacchuBook(wb: Workbook, rows: HacchuRow[], yms: string[]) {
  const ws = wb.addWorksheet('発注一覧');
  ws.getCell('A1').value = '最終実行日時';
  ws.getCell('B1').value = new Date().toLocaleString('ja-JP');
  const cols = ['商品コード', '商品名', '発注点', ...yms, '発注ロット', '仕入先', '仕入先名', '在庫', '受注残', '受注可', '発注残計', 'メモ欄'];
  for (let i = 0; i < 5; i++) {
    cols.push('発注日', '発注残');
  }
  head(ws, 2, cols);
  rows.forEach((r, i) => {
    const line: unknown[] = [r.gcode, r.gtext, r.point, ...r.months, r.lot ?? '', r.vcode, r.vname, r.zaiko, r.juzan, r.kano, r.zan, r.memo];
    r.orders.forEach(o => line.push(o.day.replace(/-/g, ''), o.hatzn));
    const row = ws.getRow(i + 3);
    row.values = line as never;
    if (r.alert) {
      row.getCell(3 + yms.length + 6).font = { color: { argb: 'FFFF0000' }, bold: true };
    }
  });
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 30;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
}

/** 倉庫ごとの在庫（大会倉庫） */
export function fillStoreBook(wb: Workbook, stores: { scode: string; name: string; rows: { gcode: string; gtext: string; zaiko: number }[] }[]) {
  for (const s of stores) {
    const ws = wb.addWorksheet((s.scode + ' ' + s.name).replace(/[\\/*?:[\]]/g, '').slice(0, 31));
    head(ws, 1, ['商品コード', '商品名', '在庫数']);
    s.rows.forEach((r, i) => { ws.getRow(i + 2).values = [r.gcode, r.gtext, r.zaiko]; });
    ws.getColumn(1).width = 18;
    ws.getColumn(2).width = 40;
  }
}

/** 売上の 商品 × 月 の集計 */
export function salesPivot(rows: SalesRow[]): { yms: string[]; data: { gcode: string; gtext: string; m: Map<string, [number, number]>; suu: number; kin: number }[] } {
  const yms = [...new Set(rows.map(r => r.uday.slice(0, 7).replace('-', '')))].sort();
  const map = new Map<string, { gcode: string; gtext: string; m: Map<string, [number, number]>; suu: number; kin: number }>();
  for (const r of rows) {
    const ym = r.uday.slice(0, 7).replace('-', '');
    const d = map.get(r.gcode) ?? { gcode: r.gcode, gtext: r.gtext, m: new Map<string, [number, number]>(), suu: 0, kin: 0 };
    const [s, k] = d.m.get(ym) ?? [0, 0];
    d.m.set(ym, [s + r.suu, k + r.kingaku]);
    d.suu += r.suu;
    d.kin += r.kingaku;
    map.set(r.gcode, d);
  }
  return { yms, data: [...map.values()].sort((a, b) => a.gcode < b.gcode ? -1 : a.gcode > b.gcode ? 1 : 0) };
}

/** 営業担当の売上（明細と 商品 × 月 の集計。バッチ uriage と同じ並び） */
export function fillSalesBook(wb: Workbook, rows: SalesRow[], tname: string, from: string) {
  const ws = wb.addWorksheet(from.slice(0, 4) + '年' + from.slice(5, 7) + '月以降売上');
  head(ws, 1, ['受注先コード', '受注先', '大分類', '部門', '担当者', '伝票区分', '売上日', '売上月', '売上年', '伝票番号', '商品コード', '名称', '数量', '単価', '税抜金額', '備考']);
  rows.forEach((r, i) => {
    const day = r.uday.replace(/-/g, '');
    ws.getRow(i + 2).values = [r.mcode, r.mname, r.daibunrui, r.chubunrui, tname, r.denku == 2 ? '返品' : '受注', day, day.slice(0, 6), day.slice(0, 4),
      r.denno, r.gcode, r.gtext, r.suu, r.tanka, r.kingaku, r.mmemo];
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const pv = wb.addWorksheet('pivot');
  const { yms, data } = salesPivot(rows);
  pv.getRow(1).values = ['商品コード', ...yms.flatMap(ym => [ym, '']), '全体', ''];
  pv.getRow(2).values = ['', ...Array(yms.length + 1).fill(['売上数', '税抜額']).flat()];
  pv.getRow(1).font = { bold: true };
  pv.getRow(2).font = { bold: true };
  const tot = new Map<string, [number, number]>();
  data.forEach((d, i) => {
    const line: (string | number | null)[] = [d.gcode];
    for (const ym of yms) {
      const v = d.m.get(ym);
      line.push(v ? v[0] : null, v ? v[1] : null);
      if (v) {
        const t = tot.get(ym) ?? [0, 0];
        tot.set(ym, [t[0] + v[0], t[1] + v[1]]);
      }
    }
    line.push(d.suu, d.kin);
    pv.getRow(i + 3).values = line;
  });
  const last: (string | number)[] = ['総計'];
  yms.forEach(ym => { const t = tot.get(ym) ?? [0, 0]; last.push(t[0], t[1]); });
  last.push(data.reduce((a, d) => a + d.suu, 0), data.reduce((a, d) => a + d.kin, 0));
  pv.getRow(data.length + 3).values = last;
  pv.getRow(data.length + 3).font = { bold: true };
  pv.getColumn(1).width = 20;
  pv.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
}
