import type { Cell, Row, Workbook, Worksheet } from 'exceljs';
import type { StoreSum, UriLine } from './repkessan.component';
import type { TesuRow, UrikakeRow, ZaikoRow } from './repkessan.service';

/** Excel に出す内容（画面の RepkessanComponent が持っている値） */
export interface KessanSource {
  shown?: { from: string; to: string; pcodes: string[] };
  rate: number | null;
  withZero: boolean;
  uriLines: UriLine[];
  urikakeShown: UrikakeRow[];
  urikakeTotal: number;
  tesu: TesuRow[];
  tesuMonths: string[];
  tesuTypes: string[];
  tesuTotal: number;
  stores: StoreSum[];
  zaikoTotal: number;
  uriTotal: number;
  tesuSum(ym: string | null, ptype: string | null): number;
  isUsd(r: ZaikoRow): boolean;
  isSuspect(r: ZaikoRow): boolean;
  amount(r: ZaikoRow): number;
  yen(r: ZaikoRow): number;
  kbnName(k: string, v: string | null): string;
  staff(c: string | null): string;
}

const NUM = '#,##0';
const HEAD_BG = 'FFE0E0E0';
const TOTAL_BG = 'FFFFF3C4';
/** 集計シートのドル円レートのセル（在庫のシートの式から参照する） */
const RATE_CELL = "'集計'!$C$5";

function headRow(row: Row, labels: string[]) {
  labels.forEach((label, i) => {
    const c = row.getCell(i + 1);
    c.value = label;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
    c.border = { bottom: { style: 'thin' } };
  });
}

function money(c: Cell, v: number | { formula: string; result: number }) {
  c.value = v;
  c.numFmt = NUM;
}

function widths(ws: Worksheet, w: number[]) {
  w.forEach((v, i) => ws.getColumn(i + 1).width = v);
}

/** シート名に使えない文字を除く（31 文字まで） */
function sheetName(s: string): string {
  return s.replace(/[\[\]:*?/\\]/g, '').slice(0, 31);
}

const ymd = (s: string | null) => s ? s.replace(/-/g, '/') : '';

/** 決算資料の Excel（集計・売上・都度売掛・入金手数料・倉庫ごとの在庫） */
export function fillKessanBook(wb: Workbook, src: KessanSource) {
  const p = src.shown!;
  const period = ymd(p.from) + '〜' + ymd(p.to);
  const now = new Date();
  const made = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate() + ' ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);

  // 倉庫ごとのシート名（同じ名前にならないように）
  const used = new Set<string>(['集計', '売上', '都度売掛', '入金手数料集計', '入金手数料明細']);
  const storeSheets = src.stores.map(s => {
    let name = sheetName('在庫_' + s.name);
    for (let i = 2; used.has(name); i++) {
      name = sheetName('在庫_' + s.name).slice(0, 28) + '_' + i;
    }
    used.add(name);
    return { s, name };
  });

  // ---- 集計 ----
  const sm = wb.addWorksheet('集計');
  widths(sm, [16, 18, 18, 8, 50]);
  sm.getCell('A1').value = '決算資料（' + period + '）';
  sm.getCell('A1').font = { bold: true, size: 14 };
  sm.getCell('A2').value = '作成: ' + made;
  sm.getCell('A4').value = '【在庫金額】';
  sm.getCell('A4').font = { bold: true };
  sm.getCell('E4').value = '期末日 ' + ymd(p.to) + ' 時点の在庫数 × 原価（期末日時点の単価）';
  sm.getCell('B5').value = '1＄＝';
  sm.getCell('C5').value = src.rate ?? 0;
  sm.getCell('C5').numFmt = '0.00';
  sm.getCell('C5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
  sm.getCell('D5').value = '円';
  sm.getCell('E5').value = 'ここの数値を変更すると在庫のシートが再計算される';
  let r = 6;
  const zfirst = r;
  for (const { s, name } of storeSheets) {
    sm.getCell(r, 2).value = s.name;
    money(sm.getCell(r, 3), { formula: "'" + name + "'!J1", result: s.yen });
    sm.getCell(r, 5).value = s.count + ' 品目（うち USD ' + s.rows.filter(e => src.isUsd(e)).length + '）';
    r++;
  }
  sm.getCell(r, 2).value = '商品合計';
  sm.getCell(r, 2).font = { bold: true };
  money(sm.getCell(r, 3), { formula: storeSheets.length ? 'SUM(C' + zfirst + ':C' + (r - 1) + ')' : '0', result: src.zaikoTotal });
  sm.getCell(r, 3).font = { bold: true };
  sm.getCell(r, 4).value = '税抜';
  r += 2;
  sm.getCell(r, 1).value = '【売上】';
  sm.getCell(r, 1).font = { bold: true };
  money(sm.getCell(r, 3), src.uriLines.length ? { formula: "'売上'!J" + (src.uriLines.length + 1), result: src.uriTotal } : 0);
  sm.getCell(r, 4).value = '税込み';
  sm.getCell(r, 5).value = '売上日が期間内の受注（返品はマイナス）';
  r += 2;
  sm.getCell(r, 1).value = '【売掛】';
  sm.getCell(r, 1).font = { bold: true };
  sm.getCell(r, 2).value = '都度';
  money(sm.getCell(r, 3), { formula: "'都度売掛'!G1", result: src.urikakeTotal });
  sm.getCell(r, 4).value = '税込み';
  sm.getCell(r, 5).value = '支払方法 ' + p.pcodes.map(c => c + ' ' + src.kbnName('pcode', c)).join('・') + '（大分類「通販」を除く）。期末日までの入金で計算';
  r += 2;
  sm.getCell(r, 1).value = '【入金手数料】';
  sm.getCell(r, 1).font = { bold: true };
  money(sm.getCell(r, 3), { formula: "'入金手数料集計'!" + String.fromCharCode(66 + src.tesuTypes.length) + (src.tesuMonths.length + 3), result: src.tesuTotal });
  sm.getCell(r, 5).value = '入金日が期間内の入金伝票の調整額（手数料など）';

  // ---- 売上（月別・税率別） ----
  const us = wb.addWorksheet('売上');
  widths(us, [8, 14, 9, 15, 13, 13, 13, 15, 14, 15]);
  headRow(us.getRow(1), ['月', '項目', '件数', '商品合計', '値引額', '送料', '手数料', '小計', '消費税', '合計']);
  src.uriLines.forEach((l, i) => {
    const row = us.getRow(i + 2);
    row.getCell(1).value = l.label || null;
    row.getCell(2).value = l.kbn;
    row.getCell(3).value = l.cnt;
    [l.gtt, l.neb, l.sor, l.tes, l.sub, l.tax, l.total].forEach((v, k) => money(row.getCell(4 + k), v));
    if (l.sum) {
      for (let c = 2; c <= 10; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
      }
    }
  });
  us.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- 都度売掛 ----
  const uk = wb.addWorksheet('都度売掛');
  widths(uk, [11, 11, 10, 28, 12, 12, 12, 13, 18, 12, 12, 11, 10, 11, 12]);
  uk.getCell('A1').value = ymd(p.to) + '時点都度売掛金残高（売上日 ' + period + (src.withZero ? '）' : '。残高 0 の伝票は除く）');
  uk.getCell('A1').font = { bold: true };
  const ukLast = src.urikakeShown.length + 2;
  money(uk.getCell('G1'), { formula: 'SUM(G3:G' + Math.max(ukLast, 3) + ')', result: src.urikakeTotal });
  uk.getCell('G1').font = { bold: true };
  headRow(uk.getRow(2), ['売上日', '伝票番号', '顧客ｺｰﾄﾞ', '氏名', '売上額', '入金額', '期末時点残高', '支払方法', '大分類', '営業担当', '内勤担当',
    '最終入金日', '調整額', '期末後入金日', '期末後入金額']);
  src.urikakeShown.forEach((e, i) => {
    const row = uk.getRow(i + 3);
    row.getCell(1).value = ymd(e.uday);
    row.getCell(2).value = e.denno;
    row.getCell(3).value = e.mcode;
    row.getCell(4).value = e.mname;
    money(row.getCell(5), e.total);
    money(row.getCell(6), e.nyukin);
    money(row.getCell(7), e.zan);
    row.getCell(8).value = src.kbnName('pcode', e.pcode);
    row.getCell(9).value = src.kbnName('daibunrui', e.daibunrui);
    row.getCell(10).value = src.staff(e.tcode1);
    row.getCell(11).value = src.staff(e.tcode);
    row.getCell(12).value = ymd(e.lastday);
    money(row.getCell(13), e.chosei);
    row.getCell(14).value = ymd(e.atoday);
    money(row.getCell(15), e.atokin);
  });
  uk.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 15 } };
  uk.views = [{ state: 'frozen', ySplit: 2 }];

  // ---- 入金手数料（月 × 入金方法） ----
  const ts = wb.addWorksheet('入金手数料集計');
  const types = src.tesuTypes;
  widths(ts, [10, ...types.map(() => 14), 14]);
  ts.getCell('A1').value = '入金伝票の調整額（入金日 ' + period + '）';
  ts.getCell('A1').font = { bold: true };
  headRow(ts.getRow(2), ['月', ...types.map(t => t ? src.kbnName('ptype', t) : '(なし)'), '合計']);
  src.tesuMonths.forEach((ym, i) => {
    const row = ts.getRow(i + 3);
    row.getCell(1).value = ym.replace('-', '/');
    types.forEach((t, k) => money(row.getCell(2 + k), src.tesuSum(ym, t)));
    money(row.getCell(2 + types.length), src.tesuSum(ym, null));
  });
  const tt = ts.getRow(src.tesuMonths.length + 3);
  tt.getCell(1).value = '合計';
  types.forEach((t, k) => money(tt.getCell(2 + k), src.tesuSum(null, t)));
  money(tt.getCell(2 + types.length), src.tesuTotal);
  tt.font = { bold: true };

  const tm = wb.addWorksheet('入金手数料明細');
  widths(tm, [11, 10, 7, 10, 28, 11, 11, 5, 14, 12, 12, 12, 24, 24]);
  headRow(tm.getRow(1), ['入金日', '入金伝票', '区分', '顧客ｺｰﾄﾞ', '氏名', '受注伝票', '請求伝票', '行', '入金方法', '入金', '出金', '調整額', '明細メモ', 'メモ']);
  src.tesu.forEach((e, i) => {
    const row = tm.getRow(i + 2);
    row.getCell(1).value = ymd(e.day);
    row.getCell(2).value = e.denno;
    row.getCell(3).value = e.kubun == 1 ? '掛売' : '都度';
    row.getCell(4).value = e.mcode;
    row.getCell(5).value = e.mname;
    row.getCell(6).value = e.jdenno;
    row.getCell(7).value = e.idenno;
    row.getCell(8).value = e.line;
    row.getCell(9).value = src.kbnName('ptype', e.ptype);
    money(row.getCell(10), e.nmoney);
    money(row.getCell(11), e.smoney);
    money(row.getCell(12), e.tmoney);
    row.getCell(13).value = e.mmemo;
    row.getCell(14).value = e.memo;
  });
  tm.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };
  tm.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- 倉庫ごとの在庫 ----
  for (const { s, name } of storeSheets) {
    const ws = wb.addWorksheet(name);
    widths(ws, [9, 14, 18, 30, 9, 7, 11, 12, 14, 14, 8]);
    headRow(ws.getRow(1), ['倉庫コード', '倉庫名称', '商品コード', '商品名称', '在庫数', '通貨', '原価', '単価*数量', '円換算合計金額', '', '小分類']);
    money(ws.getCell('J1'), { formula: 'SUM(I2:I' + Math.max(s.rows.length + 1, 2) + ')', result: s.yen });
    ws.getCell('J1').font = { bold: true };
    s.rows.forEach((e, i) => {
      const n = i + 2;
      const row = ws.getRow(n);
      row.getCell(1).value = s.scode;
      row.getCell(2).value = s.name;
      row.getCell(3).value = e.gcode;
      row.getCell(4).value = e.gtext;
      row.getCell(5).value = e.zaiko;
      row.getCell(6).value = e.currency ?? '';
      row.getCell(7).value = e.genka;
      money(row.getCell(8), { formula: 'ROUND(E' + n + '*G' + n + ',0)', result: src.amount(e) });
      money(row.getCell(9), { formula: 'ROUND(IF(F' + n + '="USD",H' + n + '*' + RATE_CELL + ',H' + n + '),0)', result: src.yen(e) });
      row.getCell(11).value = e.subcat ?? '';
      if (src.isSuspect(e)) {
        // USD で 1,000 ドル以上の原価: 円の原価に通貨 USD が付いている疑い
        for (let c = 1; c <= 11; c++) {
          row.getCell(c).font = { color: { argb: 'FFC62828' }, bold: true };
        }
      }
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}
