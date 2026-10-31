import type { Workbook, Worksheet } from 'exceljs';
import type { OcnkOrder } from './ocnk-parse';

function head(ws: Worksheet, labels: string[]) {
  ws.addRow(labels);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: labels.length } };
}

/** 取り込み結果を、受注ヘッダ・受注明細の 2 シートにする */
export function fillOcnkBook(wb: Workbook, orders: OcnkOrder[]) {
  const h = wb.addWorksheet('受注ヘッダ');
  head(h, ['注文番号', '会員区分', '会員ID', '会員コード', '取引区分', '氏名', '受注日', '大分類', '部門', '担当者', '支払方法', '入金予定', '媒体管理', '合計金額', '処理結果', '伝票番号']);
  const m = wb.addWorksheet('受注明細');
  head(m, ['注文番号', '行', '商品コード', '商品名', '数量', '単価', '金額', '税区分', '明細備考']);
  for (const o of orders) {
    h.addRow([o.cusden, o.kbn, o.webid, o.mcode, o.kake ? '掛' : '都度', o.sei, o.day, o.daibunrui, o.bumon, o.tanto, o.pay, o.nyukin, o.bkcode, o.total, o.err ? 'エラー：' + o.err : o.result, o.denno]);
    o.lines.forEach(l => m.addRow([o.cusden, l.line, l.gcode, l.gtext, l.suu, l.tanka, l.money, l.mtax, l.memo]));
  }
  [14, 20, 10, 12, 8, 18, 12, 10, 8, 10, 24, 8, 8, 12, 36, 10].forEach((w, i) => h.getColumn(i + 1).width = w);
  [14, 5, 16, 36, 7, 10, 10, 6, 30].forEach((w, i) => m.getColumn(i + 1).width = w);
}
