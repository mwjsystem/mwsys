import type { Workbook, Worksheet } from 'exceljs';
import { RoyGoods, RoyItem, RoyLine, RoyMaster, RoyMem, RoyaltyService } from './royalty.service';
import { NUM, XVal, at, box, footer, fx, greet, head, letterHead, merge, printFit, put, sheet, summary, table, widths, ymText } from './royalty-excel';

/** 集計の条件 */
export interface RoyCtx {
  srv: RoyaltyService;
  m: RoyMaster;
  /** 期間（YYYY-MM-DD） */
  from: string;
  to: string;
  /** 対象年月（期間の初日の年月） */
  y: number;
  mth: number;
  /** 新極真会: 受付日の開始（YYYY-MM-DD） */
  recvFrom: string;
  /** 中分類の名前 */
  chuName: (code: string | null) => string;
}
/** 集計から外した伝票 */
export interface RoyExcl { denno: number; mcode: string; reason: string; memo: string }
/** 作る Excel（1 団体で 2 つ作ることがある） */
export interface RoyBook { file: string; fill: (wb: Workbook) => void }
/** 集計の結果 */
export interface RoyResult {
  books: RoyBook[];
  /** 画面に出すお知らせ（合計など） */
  notes: string[];
  /** 確認が要ること */
  warns: string[];
  excluded: RoyExcl[];
}

// ---------------------------------------------------------------------
// 共通

/** VBA の Like（* だけ使う）と同じ判定 */
export function like(s: string, pat: string): boolean {
  const re = new RegExp('^' + pat.split('*').map(e => e.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(s);
}
const pats = (it: RoyItem): string[] => (it.gcodes ?? '').split(',').map(e => e.trim()).filter(e => e);
/** 条件（cond の「key:値,値」）の値。無ければ null。値の無い条件（teika など）は [] */
export function cond(it: RoyItem, key: string): string[] | null {
  for (const part of (it.cond ?? '').split(';').map(e => e.trim()).filter(e => e)) {
    const i = part.indexOf(':');
    const k = i < 0 ? part : part.slice(0, i);
    if (k.trim() == key) {
      return i < 0 ? [] : part.slice(i + 1).split(',').map(e => e.trim()).filter(e => e);
    }
  }
  return null;
}
/** 商品コードの当たり具合（完全一致がいちばん強く、前方一致は長いほど強い）。当たらなければ -1 */
function score(it: RoyItem, gcode: string): number {
  const nots = cond(it, 'not');
  if (nots && nots.some(p => like(gcode, p))) {
    return -1;
  }
  let best = -1;
  for (const p of pats(it)) {
    if (like(gcode, p)) {
      best = Math.max(best, p.includes('*') ? p.replace(/\*/g, '').length : 1000 + p.length);
    }
  }
  return best;
}
/** 商品コードが入る行（複数に当たるときは、いちばん細かい指定の行） */
export function findItem(items: RoyItem[], gcode: string): RoyItem | null {
  let best: RoyItem | null = null;
  let bs = -1;
  for (const it of items) {
    const s = score(it, gcode);
    if (s > bs) {
      bs = s;
      best = it;
    }
  }
  return best;
}
/** 品番の欄に出す文字（最初の商品コードの * を除いたもの） */
const firstCode = (it: RoyItem): string => (pats(it)[0] ?? '').replace(/\*/g, '');

const lastDay = (y: number, m: number): number => new Date(y, m, 0).getDate();
const ymd = (y: number, m: number, d: number): string => y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
const md = (s: string | null): string => s ? s.slice(0, 10).replace(/-/g, '/') : '';
const memoOf = (l: RoyLine): string => [l.den.dmemo, l.den.nmemo].filter(e => e).join(' ');
const r1 = (v: number): number => Math.round(v * 100) / 100;

/** 受注伝票の期間（売上日）の条件 */
const udayIn = (c: RoyCtx) => ({ uday: { _gte: c.from, _lte: c.to } });
const notZero = { toutmoney: { _neq: 0 } };
const memsOf = (c: RoyCtx, kind: string): RoyMem[] => c.m.mems.filter(e => e.kind == kind).sort((a, b) => a.seq - b.seq);
const codesOf = (c: RoyCtx, kind: string): string[] => memsOf(c, kind).map(e => (e.mcode ?? '').trim()).filter(e => e);
const itemsOf = (c: RoyCtx, grp?: string | null): RoyItem[] =>
  c.m.items.filter(e => grp === undefined || (e.grp ?? '') == (grp ?? '')).sort((a, b) => a.seq - b.seq);
/** 単価の履歴から、その日（無ければ最新）の単価 */
function tankaOn(g: RoyGoods | undefined, day: string | null, key: 'tanka2' | 'tanka3'): number | null {
  if (!g || g.tankas.length == 0) {
    return null;
  }
  const t = day ? g.tankas.find(e => e.day <= day) ?? g.tankas[g.tankas.length - 1] : g.tankas[0];
  return t[key];
}
const ymLabel = (c: RoyCtx): string => ymText(c.y, c.mth);
const fileYm = (c: RoyCtx): string => c.y + ('0' + c.mth).slice(-2);

/** 品番ごと（区分）の合計の表のある、ふつうの明細書 */
interface SimpleOpt {
  title?: string;
  heads: string[];
  widths: number[];
  rows: ((r: number) => XVal[])[];
  /** 金額の列（1 から） */
  amountCol: number;
  /** 合計の出し方: tax 10%対象・消費税・合計額 / total 総計だけ */
  totals: 'tax' | 'total';
  /** 上の合計の欄（合計額のセル番地と、値の行の番号を受け取って作る） */
  top: (total: string, vr: number) => { c: number; c2?: number; label: string; v: XVal; fmt?: string }[];
  note?: string;
  footerLabel?: string;
  /** 宛先（省略すると団体の宛先） */
  dest?: string | null;
}
function simpleStatement(ws: Worksheet, c: RoyCtx, o: SimpleOpt): string {
  const last = o.heads.length;
  widths(ws, o.widths);
  let r = letterHead(ws, o.title ?? 'ロイヤリティー明細書', c.m.org, last, o.dest);
  const topRow = r;
  r += 2;
  if (o.note) {
    put(ws, r, last, o.note).alignment = { horizontal: 'right' };
    r++;
  }
  r = greet(ws, r + 1, c.m.org, last);
  put(ws, r, 1, '商品集計').font = { bold: true };
  r++;
  const first = r + 1;
  const end = table(ws, r, 1, o.heads, o.rows, o.heads.map(() => undefined));
  const sum = (end >= first) ? `SUM(${at(first, o.amountCol)}:${at(end, o.amountCol)})` : '0';
  const amounts = o.rows.map((row, i) => row(first + i)[o.amountCol - 1]);
  const total0 = amounts.reduce((s: number, v) => s + (typeof v == 'number' ? v : (v && typeof v == 'object' && !(v instanceof Date) ? Number(v.v ?? 0) : 0)), 0);
  r = end + 1;
  let totalAddr: string;
  if (o.totals == 'tax') {
    merge(ws, r, 1, r, o.amountCol - 1, '10％対象');
    put(ws, r, o.amountCol, fx(sum, total0));
    merge(ws, r + 1, 1, r + 1, o.amountCol - 1, '10％消費税');
    put(ws, r + 2, o.amountCol, fx(`${at(r, o.amountCol)}+${at(r + 1, o.amountCol)}`, r1(total0 * 1.1)));
    put(ws, r + 1, o.amountCol, fx(`${at(r, o.amountCol)}*0.1`, r1(total0 * 0.1)));
    merge(ws, r + 2, 1, r + 2, o.amountCol - 1, '合計額');
    box(ws, r, 1, r + 2, o.amountCol);
    for (let i = 0; i < 3; i++) {
      ws.getCell(r + i, 1).font = { bold: true };
    }
    totalAddr = at(r + 2, o.amountCol);
    r += 4;
  } else {
    merge(ws, r, 1, r, o.amountCol - 1, '総計').font = { bold: true };
    put(ws, r, o.amountCol, fx(sum, total0));
    box(ws, r, 1, r, o.amountCol);
    totalAddr = at(r, o.amountCol);
    r += 2;
  }
  summary(ws, topRow, o.top(totalAddr, topRow + 1));
  put(ws, topRow + 1, 1, ymLabel(c)).alignment = { horizontal: 'center' };
  footer(ws, r, c.m.org, last, o.footerLabel ?? '振込先');
  printFit(ws);
  return totalAddr;
}
/** 繰越のある団体の、上の合計の欄（対象年月・前回繰越・今回集計額・今回支払繰越・今回御支払金額合計） */
const carryTop = (total: string, vr: number) => [
  { c: 1, label: '対象年月', v: null },
  { c: 2, label: '前回繰越金額(税込)', v: null },
  { c: 3, c2: 4, label: '今回集計額(税込)', v: fx(total) },
  { c: 5, label: '今回支払繰越金額(税込)', v: null },
  { c: 6, label: '※今回御支払金額合計(税込)', v: fx(`B${vr}+C${vr}`) }
];
const CARRY_NOTE = '※お支払い金額が\\5,000‐未満の場合は次回繰り越しさせて頂きます。';

/** 受注一覧のシート */
function listSheet(wb: Workbook, heads: string[], rows: XVal[][], fmts: (string | undefined)[] = []) {
  const ws = sheet(wb, '受注一覧');
  rows.forEach((row, i) => row.forEach((v, j) => put(ws, i + 2, j + 1, v, fmts[j])));
  heads.forEach((h, j) => put(ws, 1, j + 1, h));
  head(ws, 1, 1, heads.length);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  heads.forEach((h, j) => ws.getColumn(j + 1).width = Math.max(10, h.length * 2 + 2));
  return ws;
}

/** 行ごとの数量の合計 */
function qtyBy(lines: RoyLine[], items: RoyItem[]): Map<RoyItem, number> {
  const q = new Map<RoyItem, number>();
  for (const l of lines) {
    const it = findItem(items, l.gcode);
    if (it) {
      q.set(it, (q.get(it) ?? 0) + l.suu * l.sign);
    }
  }
  return q;
}
const empty = (): RoyResult => ({ books: [], notes: [], warns: [], excluded: [] });

// ---------------------------------------------------------------------
// IBKO（受注先の納品先が IBKO の伝票。配送料は北海道・沖縄 / 本州 / 本州(事前振込) に分ける）

/** 配送料の卸価格（受注一覧に出す）。税抜単価 → 卸価格（税抜） */
const Z01_OROSHI: Record<number, number> = { 1300: 1100, 2000: 1800 };

async function ibko(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const lines = await c.srv.lines({ ...udayIn(c), ncode: { _in: codesOf(c, 'target') } }, notZero);
  const items = itemsOf(c).filter(e => e.grp != 'ship');
  const ships = itemsOf(c, 'ship');
  const regions = await c.srv.regions(lines.map(l => l.den.ncode ?? ''));
  const goods = await c.srv.goods(lines.map(l => l.gcode));
  const qty = new Map<RoyItem, number>();
  for (const l of lines) {
    let it: RoyItem | null = null;
    if (l.gcode == 'Z01') {
      const region = regions.get((l.den.ncode ?? '') + '/' + (l.den.nadr ?? 0)) ?? '';
      it = ships.find(s => (cond(s, 'region') ?? []).some(p => region.startsWith(p)))
        ?? ships.find(s => (cond(s, 'pcode') ?? []).includes((l.den.pcode ?? '').trim())) ?? null;
    } else {
      it = findItem(items, l.gcode);
    }
    if (it) {
      qty.set(it, (qty.get(it) ?? 0) + l.suu * l.sign);
    }
  }
  const all = [...items, ...ships].sort((a, b) => a.seq - b.seq);
  // 受注一覧（卸価格つき。伝票の最後の行に卸価格の合計）
  const list: XVal[][] = [];
  let sum = 0;
  lines.forEach((l, i) => {
    let o: number | null = null;
    if (l.gcode == 'Z01') {
      o = Z01_OROSHI[l.tanka] ?? null;
    } else {
      o = tankaOn(goods.get(l.gcode), null, 'tanka2');
    }
    sum += (o ?? 0) * l.suu;
    const lastOfDen = i == lines.length - 1 || lines[i + 1].denno != l.denno;
    list.push([md(l.den.uday), l.denno, l.gcode, l.gtext, l.suu, l.tanka, l.toutmoney, o, o == null ? null : r1(o * 1.1), l.mmemo, lastOfDen ? sum : null]);
    if (lastOfDen) {
      sum = 0;
    }
  });
  const total = all.reduce((s, it) => s + (qty.get(it) ?? 0) * (it.price ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回集計額（税込）' + Math.round(total * 1.1).toLocaleString() + ' 円');
  ret.books.push({
    file: 'IBKOロイヤリティ_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '集計');
      simpleStatement(ws, c, {
        heads: ['品番', '商品名', '数量', '単価(税抜)', '価格(税抜)', '備考'], widths: [14, 34, 8, 12, 14, 18],
        rows: all.map(it => (r: number) => [it.grp == 'ship' ? 'Z01' : firstCode(it), it.name, qty.get(it) ?? null, it.price, fx(`C${r}*D${r}`, (qty.get(it) ?? 0) * (it.price ?? 0)), it.memo]),
        amountCol: 5, totals: 'tax', top: carryTop, note: CARRY_NOTE
      });
      listSheet(wb, ['売上日', '伝票番号', '商品コード', '名称', '数量', '単価', '税抜金額', '卸価格（税抜き）', '卸価格（税込み）', '備考', '卸価格合計'], list,
        [undefined, '0', undefined, undefined, NUM, NUM, NUM, NUM, NUM, undefined, NUM]);
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 大石道場（納品先が道場の伝票。単価は各行の最後の商品の卸価格（単価2）× 率、切り捨て）

async function oishi(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const lines = (await c.srv.lines({ ...udayIn(c), ncode: { _in: codesOf(c, 'target') } }, notZero)).filter(l => findItem(items, l.gcode));
  const goods = await c.srv.goods(items.map(it => pats(it)[pats(it).length - 1] ?? ''));
  const price = new Map<RoyItem, number>();
  for (const it of items) {
    const t = tankaOn(goods.get(pats(it)[pats(it).length - 1] ?? ''), null, 'tanka2');
    price.set(it, t != null && it.rate != null ? Math.floor(t * it.rate) : (it.price ?? 0));
  }
  const qty = qtyBy(lines, items);
  const total = items.reduce((s, it) => s + (qty.get(it) ?? 0) * (price.get(it) ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回集計額（税込）' + Math.round(total * 1.1).toLocaleString() + ' 円');
  ret.books.push({
    file: '大石道場ロイヤリティ_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '集計');
      let prev = '';
      simpleStatement(ws, c, {
        heads: ['品番', '商品', '数量', 'R単価(税抜)', '価格(税抜)', '備考'], widths: [12, 40, 8, 12, 14, 16],
        rows: items.map(it => (r: number) => {
          const g = it.grp ?? '';
          const show = g != prev ? g : '';
          prev = g;
          return [show, it.name, qty.get(it) ?? null, price.get(it) ?? 0, fx(`C${r}*D${r}`, (qty.get(it) ?? 0) * (price.get(it) ?? 0)), it.memo];
        }),
        amountCol: 5, totals: 'tax', top: carryTop, note: CARRY_NOTE
      });
      listSheet(wb, ['売上日', '商品コード', '名称', '数量', '単価', '税抜金額', '備考'],
        lines.map(l => [md(l.den.uday), l.gcode, l.gtext, l.suu, l.tanka, l.toutmoney, l.mmemo]), [undefined, undefined, undefined, NUM, NUM, NUM]);
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 勇士會館（中分類 120 の伝票。除く受注先あり。単価 = 商品定価 × 率）

async function yushi(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const ex = codesOf(c, 'exclude');
  const lines = await c.srv.lines({ ...udayIn(c), chubunrui: { _eq: '120' }, ...(ex.length ? { mcode: { _nin: ex } } : {}) }, notZero);
  const qty = qtyBy(lines, items);
  const unit = (it: RoyItem): number => r1((it.price ?? 0) * (it.rate ?? 1));
  const total = items.reduce((s, it) => s + (qty.get(it) ?? 0) * unit(it), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回集計額（税込）' + Math.round(total * 1.1).toLocaleString() + ' 円');
  ret.books.push({
    file: '勇士會館ロイヤリティ明細書_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '集計');
      let prev = '';
      simpleStatement(ws, c, {
        title: 'ロイヤリティ明細書',
        heads: ['品番', '商品', '数量', '商品定価(税抜)', '単価(税抜)', '価格(税抜)', '備考'], widths: [10, 44, 8, 12, 12, 14, 22],
        rows: items.map(it => (r: number) => {
          const g = it.grp ?? '';
          const show = g != prev ? g : '';
          prev = g;
          return [show, it.name, qty.get(it) ?? null, it.price, fx(`D${r}*${it.rate ?? 1}`, unit(it)), fx(`C${r}*E${r}`, (qty.get(it) ?? 0) * unit(it)), it.memo];
        }),
        amountCol: 6, totals: 'tax', footerLabel: 'お支払方法',
        top: (total, vr) => [
          { c: 1, label: '対象年月', v: null },
          { c: 2, label: '前回繰越金額(税込)', v: null },
          { c: 3, c2: 4, label: '今回集計額(税込)', v: fx(total) },
          { c: 5, label: '今回支払繰越金額(税込)', v: null },
          { c: 6, c2: 7, label: '※今回御支払金額合計(税込)', v: fx(`B${vr}+C${vr}`) }
        ]
      });
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 大阪浪速道場（中分類 121、商品コード KU…-K… の伝票。ロイヤリティ = 税抜単価 − 売上日の通常価格（単価2））

async function naniwa(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const lines = (await c.srv.lines({ ...udayIn(c), chubunrui: { _eq: '121' } }, { ...notZero, gcode: { _like: 'KU%' } }))
    .filter(l => like(l.gcode, 'KU*-K*'));
  const goods = await c.srv.goods(lines.map(l => l.gcode));
  const qty = new Map<RoyItem, number>();
  const roy = new Map<RoyItem, number>();
  const list: XVal[][] = [];
  for (const l of lines) {
    const normal = tankaOn(goods.get(l.gcode), l.den.uday, 'tanka2');
    const unit = normal == null ? null : l.tanka - normal;
    list.push([md(l.den.uday), l.gcode, l.gtext, l.suu, l.tanka, l.mmemo, l.denno, normal, unit]);
    if (normal == null) {
      ret.warns.push('通常価格（単価2）がない商品: ' + l.gcode + '（伝票 ' + l.denno + '）');
    }
    const it = findItem(items, l.gcode);
    if (it) {
      qty.set(it, (qty.get(it) ?? 0) + l.suu * l.sign);
      roy.set(it, (roy.get(it) ?? 0) + (unit ?? 0) * l.suu * l.sign);
    }
  }
  const total = items.reduce((s, it) => s + (roy.get(it) ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回集計額（税込）' + Math.round(total * 1.1).toLocaleString() + ' 円');
  ret.books.push({
    file: '大阪浪速道場ロイヤリティ_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '集計');
      let prev = '';
      simpleStatement(ws, c, {
        heads: ['品番', '商品名', '数量', 'ロイヤリティ', '備考', ''], widths: [12, 40, 8, 14, 16, 16],
        rows: items.map(it => () => {
          const g = it.grp ?? '';
          const show = g != prev ? g : '';
          prev = g;
          return [show, it.name, qty.get(it) ?? null, roy.has(it) ? roy.get(it)! : null, it.memo, null];
        }),
        amountCol: 4, totals: 'tax', top: carryTop, note: CARRY_NOTE
      });
      put(ws, 2, 1, '期間 ' + md(c.from) + '〜' + md(c.to));
      listSheet(wb, ['売上日', '商品コード', '名称', '数量', '税抜単価', '備考', '伝票番号', '通常価格', 'ロイヤリティ単価'], list,
        [undefined, undefined, undefined, NUM, NUM, undefined, '0', NUM, NUM]);
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 芦原会館（中分類 100 の伝票の道着・帯）

async function ashihara(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const lines = (await c.srv.lines({ ...udayIn(c), chubunrui: { _eq: '100' } }, notZero)).filter(l => findItem(items, l.gcode));
  const qty = qtyBy(lines, items);
  const total = items.reduce((s, it) => s + (qty.get(it) ?? 0) * (it.price ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回集計額 ' + Math.round(total).toLocaleString() + ' 円');
  ret.books.push({
    file: '芦原会館ロイヤリティー計算表_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '集計');
      simpleStatement(ws, c, {
        heads: ['商品', '', '', '数量', '単価', '価格', '備考'], widths: [16, 14, 10, 8, 10, 14, 20],
        rows: items.map(it => (r: number) => [it.name, null, null, qty.get(it) ?? null, it.price, fx(`D${r}*E${r}`, (qty.get(it) ?? 0) * (it.price ?? 0)), it.memo]),
        amountCol: 6, totals: 'total',
        top: (total, vr) => [
          { c: 1, label: '対象年月', v: null },
          { c: 2, c2: 3, label: '今回集計額', v: fx(total) },
          { c: 4, c2: 5, label: '御請求額', v: null },
          { c: 6, c2: 7, label: '請求額相殺金額', v: fx(`B${vr}-D${vr}`) }
        ]
      });
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// NAS（媒体管理 10 NAS会員Web、または伝票備考に「NAS会員」の伝票。差額 = 定価（税抜単価）− 卸単価（単価3））

async function nas(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const lines0 = await c.srv.lines({ ...udayIn(c), _or: [{ bkcode: { _like: '%10' } }, { dmemo: { _like: '%NAS会員%' } }] });
  const goods = await c.srv.goods(lines0.map(l => l.gcode));
  const lines = lines0.filter(l => !like(l.gcode, 'Z*') && !like(l.gcode, 'MALL*') && String(goods.get(l.gcode)?.gkbn ?? '0').trim() == '0')
    .sort((a, b) => a.gcode < b.gcode ? -1 : a.gcode > b.gcode ? 1 : 0);
  if (lines.length == 0) {
    ret.warns.push('売上伝票が見つかりませんでした');
  }
  const names = await c.srv.members(lines.map(l => l.den.ncode ?? ''));
  type Det = { l: RoyLine; teika: number; oroshi: number; sa: number; sakei: number };
  const det: Det[] = lines.map(l => {
    const teika = l.suu ? r1(l.toutmoney / l.suu) : l.tanka;
    const oroshi = tankaOn(goods.get(l.gcode), null, 'tanka3') ?? 0;
    const sa = teika - oroshi;
    return { l, teika, oroshi, sa, sakei: l.suu * sa * l.sign };
  });
  const by = new Map<string, { gcode: string; name: string; suu: number; sa: number }>();
  for (const d of det) {
    const e = by.get(d.l.gcode) ?? { gcode: d.l.gcode, name: d.l.gtext ?? '', suu: 0, sa: 0 };
    e.suu += d.l.suu * d.l.sign;
    e.sa += d.sakei;
    by.set(d.l.gcode, e);
  }
  const rows = [...by.values()];
  const urikei = det.reduce((s, d) => s + d.l.suu * d.teika * d.l.sign, 0);
  const sagaku = rows.reduce((s, e) => s + e.sa, 0);
  const tax = rows.reduce((s, e) => s + Math.ceil(e.sa * 0.1), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回御支払金額合計 ' + Math.round(sagaku + tax).toLocaleString() + ' 円');
  ret.books.push({
    file: 'NAS_Web売上集計_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '報告書');
      widths(ws, [14, 30, 12, 12, 10, 14, 4, 12, 8]);
      const last = 9;
      let r = letterHead(ws, 'Web売上報告書', c.m.org, last);
      put(ws, r, 1, '対象年月');
      put(ws, r, 2, ymLabel(c));
      put(ws, r, last, '担当者');
      r += 2;
      put(ws, r, 1, c.m.org.greet ?? '');
      r += 1;
      summary(ws, r, [
        { c: 1, c2: 2, label: '商品売上総額', v: urikei },
        { c: 3, c2: 4, label: '差額合計', v: sagaku },
        { c: 5, c2: 6, label: '消費税額', v: tax },
        { c: 7, c2: 9, label: '今回御支払金額合計', v: sagaku + tax }
      ]);
      r += 3;
      const end = table(ws, r, 1, ['商品', '', '', '', '数量', '差額計', '', '消費税額', ''],
        rows.map(e => () => [e.gcode, e.name, null, null, e.suu, e.sa, null, Math.ceil(e.sa * 0.1), null]));
      put(ws, end + 1, 1, '　以上');
      printFit(ws);
      const wd = sheet(wb, '明細');
      const dl = [...det].sort((a, b) => (a.l.den.uday ?? '') < (b.l.den.uday ?? '') ? -1 : (a.l.den.uday ?? '') > (b.l.den.uday ?? '') ? 1 : a.l.denno - b.l.denno);
      table(wd, 1, 1, ['売上日', '伝票番号', '購入者', '商品コード', '名称', '数量', '定価(税抜)', '卸単価(税抜)', '単価差額', '差額計'],
        dl.map(d => () => [md(d.l.den.uday), d.l.denno, names.get(d.l.den.ncode ?? '')?.name ?? '', d.l.gcode, d.l.gtext, d.l.suu * d.l.sign, d.teika, d.oroshi, d.sa, d.sakei]),
        [undefined, '0', undefined, undefined, undefined, NUM, NUM, NUM, NUM, NUM]);
      widths(wd, [11, 10, 20, 18, 34, 7, 11, 11, 10, 11]);
    }
  });
  return ret;
}

export { ibko, oishi, yushi, naniwa, ashihara, nas, empty, itemsOf, memsOf, codesOf, udayIn, notZero, firstCode, pats, lastDay, ymd, md, memoOf, r1, ymLabel, fileYm, tankaOn, qtyBy, listSheet, simpleStatement };
