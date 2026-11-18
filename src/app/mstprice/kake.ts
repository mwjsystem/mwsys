/**
 * 掛率表の行づくりと Excel（現行の「HIS16掛率表作成マクロ」と印刷用の置き換え）。DB に触らない。
 *  ・まとめ: 商品グループごとに、定価と卸価格が同じ商品をまとめ、サイズを「4/8oz」のようにつなぐ（印刷用と同じ形）
 *  ・明細: 商品ごと
 * 価格は税込で出す。通販定価（tanka1）は税込、ほかの単価・特別単価は税抜なので × 1.1 して四捨五入する。
 * 掛率 = 卸価格（税抜）÷ 定価（税抜）
 */
import { TankaKey } from './../mstgoods/goods-const';
import { KakeGoods } from './price.service';
import { yen } from './price-parse';

export interface KakeRow {
  page: number | null;
  /** グループの最初の行だけ品番・商品名を出す */
  first: boolean;
  code: string;
  gcode: string;
  size: string;
  name: string;
  jan: string;
  /** 定価（税込） */
  teika: number;
  /** 卸価格（税込）。価格が無いときは null */
  price: number | null;
  rate: number | null;
  send: string;
  /** 特別単価を使った */
  special: boolean;
}

export interface KakeOpts {
  key: TankaKey;
  /** まとめ = true、明細 = false */
  merge: boolean;
  /** 特別単価のある商品だけ */
  onlySpecial: boolean;
}

/** 送料の欄（送料区分が空なら基本送料） */
export const sendText = (s: string) => (s ? '送料区分 ' + s : '基本送料');

/** 1 商品の定価・卸価格（税込）と掛率 */
function priceOf(g: KakeGoods, key: TankaKey): { teika: number; price: number | null; rate: number | null; special: boolean } {
  const t = g.tanka;
  const teika = t?.tanka1 ?? 0;
  const special = g.sptanka != null && g.sptanka > 0;
  // tanka1（通販定価）を使う顧客は税込の単価。ほかは税抜
  const incl = key == 'tanka1';
  const base = special ? g.sptanka! : (t?.[key] ?? 0);
  if (!base) {
    return { teika, price: null, rate: null, special: false };
  }
  const price = incl ? yen(base) : yen(base * 1.1);
  const ex = incl ? base / 1.1 : base;
  const rate = teika ? ex / (teika / 1.1) : null;
  return { teika, price, rate, special };
}

/** サイズをつなぐ（「4oz」「8oz」→「4/8oz」。後ろの単位が同じなら最後だけに付ける） */
export function joinSizes(sizes: string[]): string {
  const s = [...new Set(sizes.filter(e => e))];
  if (s.length <= 1) {
    return s[0] ?? '';
  }
  const m = s.map(e => /^([0-9.]+)([^0-9.]*)$/.exec(e));
  if (m.every(e => e) && m.every(e => e![2] == m[0]![2])) {
    return m.map(e => e![1]).join('/') + m[0]![2];
  }
  return s.join('/');
}

/** 掛率表の行を作る（頁 → 品番 → 商品コードの順） */
export function buildKake(goods: KakeGoods[], o: KakeOpts): KakeRow[] {
  const list = goods
    .filter(g => g.tanka && g.tanka.tanka1 > 0)
    .filter(g => !o.onlySpecial || (g.sptanka != null && g.sptanka > 0))
    .sort((a, b) => (a.catpage ?? 99999) - (b.catpage ?? 99999) || a.code.localeCompare(b.code) || a.gcode.localeCompare(b.gcode));
  const rows: KakeRow[] = [];
  let i = 0;
  while (i < list.length) {
    const code = list[i].code;
    const grp: KakeGoods[] = [];
    while (i < list.length && list[i].code == code) {
      grp.push(list[i++]);
    }
    if (o.merge) {
      // 定価・卸価格・送料・特別単価が同じ商品をまとめる（出てきた順）
      const buckets = new Map<string, { g: KakeGoods[]; p: ReturnType<typeof priceOf> }>();
      for (const g of grp) {
        const p = priceOf(g, o.key);
        const k = [p.teika, p.price, g.send, p.special].join('\t');
        const b = buckets.get(k) ?? { g: [], p };
        b.g.push(g);
        buckets.set(k, b);
      }
      let first = true;
      buckets.forEach(b => {
        const g0 = b.g[0];
        rows.push({
          page: g0.catpage, first, code, gcode: b.g.map(g => g.gcode).join(' '), size: joinSizes(b.g.map(g => g.size)),
          name: g0.gname || g0.gtext, jan: '', teika: b.p.teika, price: b.p.price, rate: b.p.rate, send: sendText(g0.send), special: b.p.special
        });
        first = false;
      });
    } else {
      grp.forEach((g, k) => {
        const p = priceOf(g, o.key);
        rows.push({
          page: g.catpage, first: k == 0, code, gcode: g.gcode, size: [g.size, g.color].filter(e => e).join(' '),
          name: g.gtext || g.gname, jan: g.jan, teika: p.teika, price: p.price, rate: p.rate, send: sendText(g.send), special: p.special
        });
      });
    }
  }
  return rows;
}

/** exceljs の使うところだけ */
interface Ws {
  addRow(v: unknown[]): { font: unknown; height: number; eachCell(f: (c: { border: unknown; fill: unknown; numFmt: string; alignment: unknown; font: unknown }, n: number) => void): void };
  mergeCells(r: string): void;
  columns: { width?: number }[];
  pageSetup: Record<string, unknown>;
  getCell(a: string): { value: unknown; font: unknown; alignment: unknown };
}

export interface KakeHead { title: string; sub: string; notes: string[]; priceLabel: string }

/** 掛率表のシートを作る（印刷は A4 縦・横 1 ページ・見出しの行を毎ページ） */
export function writeKake(ws: Ws, rows: KakeRow[], h: KakeHead, merge: boolean) {
  const thin = { style: 'thin', color: { argb: 'FF999999' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const ncol = merge ? 8 : 10;
  const last = String.fromCharCode(64 + ncol);
  ws.addRow([h.title]);
  ws.mergeCells('A1:' + String.fromCharCode(64 + ncol - 2) + '1');
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell(String.fromCharCode(64 + ncol - 1) + '1').value = h.sub;
  ws.getCell(String.fromCharCode(64 + ncol - 1) + '1').font = { bold: true, color: { argb: 'FFC62828' } };
  for (const n of h.notes) {
    ws.addRow([n]).font = { size: 9 };
  }
  const head = merge
    ? ['頁', '品番', 'サイズ/重さ', '商品名', '定価（税込）', h.priceLabel, '掛率', '送料']
    : ['頁', '品番', '品番詳細', 'サイズ/色', '商品名', 'JANコード', '定価（税込）', h.priceLabel, '掛率', '送料'];
  const hr = ws.addRow(head);
  const headRow = 1 + h.notes.length + 1;
  hr.eachCell(c => {
    c.border = border;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (const r of rows) {
    const v = merge
      ? [r.first ? r.page : null, r.first ? r.code : '', r.size, r.first ? r.name : '', r.teika, r.price, r.rate, r.send]
      : [r.first ? r.page : null, r.first ? r.code : '', r.gcode, r.size, r.name, r.jan, r.teika, r.price, r.rate, r.send];
    const row = ws.addRow(v);
    row.eachCell((c, n) => {
      c.border = border;
      c.font = { size: 10 };
      const col = merge ? n : n - 2;
      if (col == 5 || col == 6) {
        c.numFmt = '"¥"#,##0';
      } else if (col == 7) {
        c.numFmt = '0%';
        c.alignment = { horizontal: 'center' };
      }
      if (r.special) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
      }
    });
  }
  ws.columns.forEach((c, i) => c.width = (merge ? [5, 12, 14, 34, 12, 12, 7, 12] : [5, 12, 18, 14, 34, 15, 12, 12, 7, 12])[i] ?? 10);
  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: headRow + ':' + headRow, printArea: 'A1:' + last + (headRow + rows.length),
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
}
