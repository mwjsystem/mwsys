import type { Workbook, Worksheet } from 'exceljs';
import { RoyDen, RoyItem, RoyLine, RoyMem } from './royalty.service';
import { NUM, at, box, fx, head, merge, printFit, put, sheet, widths } from './royalty-excel';
import { RoyCtx, RoyExcl, RoyResult, codesOf, cond, empty, itemsOf, like, memsOf, pats, ymd } from './royalty-calc';

/*
 * 新極真会（大分類 100004 の伝票）。現行の「新極ロイヤリティ.xlsm」と「新極ロイヤリティ年間集計表.xlsm」の置き換え。
 *
 * 国内分: 受付日が「受付日の開始」〜対象月の末日の伝票を読み、明細ごとに受注日を伝票の備考から決める。
 *   ・伝票備考（＋納品書備考）に「管理番号,管理番号… M/D受注」（1 日目の受注日）
 *   ・受注日が複数あるときは、2 日目以降を「M/D受注:X行」（X はその受注日の明細の開始行）で書く。
 *     どの欄に書いてもよい（伝票備考・納品書備考・受注先伝票番号・出荷指示書備考）。
 *     移行したデータは、旧 WEBNO が受注先伝票番号、旧 WEBNO の次の行・代引金額が出荷指示書備考に入っている。
 *   ・受注日の月が対象の月でない明細は「他月受注あり」として外す
 *   支部・道場は納品先で決める（道場はまとめる先の支部に、本部の別納先は「顧客コード-枝番」に）。
 *   明細書の数は、支部・道場の一覧（マスタ）にある納品先の分だけ（帯・道着は一覧に無い納品先も数える。現行と同じ）
 * 海外分: 受注先が海外新極真会の伝票を、出荷日が対象の月のもので数える
 */

/**
 * 帯・道着の区分（KDCB）。商品コードの判定は現行のマクロと同じ順。
 * 記念道着は、マスタの区分 kdcb の行の条件「like:商品コード,…;nodetail:商品コード,…」で決める
 * （like に当たれば、その行の区分。nodetail に当たるものは数だけ数えて、日別の明細には出さない）
 */
function kdKey(gcode: string, mmemo: string | null, kinen: RoyItem[]): { key: string; detail: boolean } | null {
  if (like(gcode, 'CBSK1WH*') || like(gcode, 'CBSK1K*')) {
    return { key: 'ZZSK001', detail: true };
  }
  if (like(gcode, 'CBSK1*')) {
    return { key: like(gcode, 'CBSK1*-SV') || (mmemo ?? '').includes('銀ﾓｰﾙ入り') ? 'ZZSK011' : 'ZZSK010', detail: true };
  }
  const rules: [string, string][] = [['KD1-*U', 'ZZSK030'], ['KD1-*S', 'ZZSK040'], ['KD2*U', 'ZZSK060'], ['KD2*S', 'ZZSK070'], ['KD2*', 'ZZSK050'],
    ['KD3*U', 'ZZSK090'], ['KD3*S', 'ZZSK100'], ['KD3*', 'ZZSK080']];
  for (const [p, k] of rules) {
    if (like(gcode, p)) {
      return { key: k, detail: true };
    }
  }
  for (const it of kinen) {
    if ((cond(it, 'like') ?? []).some(p => like(gcode, p))) {
      return { key: (it.gcodes ?? '').trim(), detail: !(cond(it, 'nodetail') ?? []).some(p => like(gcode, p)) };
    }
  }
  if (like(gcode, 'KD1-*')) {
    return { key: 'ZZSK020', detail: true };
  }
  return null;
}

const RE_DAY1 = /(\d{1,2})\/(\d{1,2})受注(?![:：]\s*\d+\s*行)/;
const RE_JYU = /受注(?![:：]\s*\d+\s*行)/g;
const RE_MARK = /(\d{1,2})\/(\d{1,2})受注[:：]\s*(\d+)\s*行/g;

/** 明細の受注日（日）。外すときは理由 */
export function shinDay(d: RoyDen, line: number, month: number, nday: number): number | string {
  const t1 = (d.dmemo ?? '') + (d.nmemo ?? '');
  const cnt = (t1.match(RE_JYU) ?? []).length;
  if (cnt == 0) {
    return '伝票備考に「受注」がない';
  }
  const m1 = RE_DAY1.exec(t1);
  if (!m1) {
    return '伝票備考の入力不正';
  }
  let mm = Number(m1[1]);
  let dd = Number(m1[2]);
  if (cnt >= 2) {
    const all = [d.dmemo, d.nmemo, d.cusden, d.smemo].map(e => e ?? '').join('\n');
    const marks = [...all.matchAll(RE_MARK)].map(x => ({ m: Number(x[1]), d: Number(x[2]), line: Number(x[3]) })).sort((a, b) => a.line - b.line);
    if (marks.length < cnt - 1) {
      return (marks.length + 2) + '日目の受注日（M/D受注:X行）がない';
    }
    for (const k of marks.slice(0, cnt - 1)) {
      if (line >= k.line) {
        mm = k.m;
        dd = k.d;
      }
    }
  }
  if (mm != month) {
    return '他月受注あり';
  }
  if (dd < 1 || dd > nday) {
    return '伝票備考の入力不正';
  }
  return dd;
}

/** 1 か月分の集計 */
interface ShinMonth {
  y: number; m: number; nday: number;
  /** 国内: 商品（サポーター・帯留め・赤帯）→ 支部・道場 → 日ごとの数 */
  det: Map<RoyItem, Map<string, number[]>>;
  /** 国内: 帯・道着の区分 → 支部・道場 → 日ごとの数 */
  kdet: Map<string, Map<string, number[]>>;
  /** 国内: 帯・道着の区分ごとの数（一覧に無い納品先も含む） */
  sumK: Map<string, number>;
  /** 海外: 帯・道着の区分ごとの数 */
  kaiK: Map<string, number>;
  /** 海外: 商品名ごとの数 */
  kaiF: Map<string, number>;
  excluded: RoyExcl[];
  /** 一覧に無い納品先（キー → 数） */
  unknown: Map<string, number>;
  lines: number;
}

const add = (map: Map<string, number[]>, key: string, day: number, n: number, nday: number) => {
  const a = map.get(key) ?? new Array<number>(nday + 1).fill(0);
  a[day] += n;
  map.set(key, a);
};
const dojoKey = (m: RoyMem): string => (m.mcode ?? '').trim() + (m.eda ? '-' + m.eda.trim() : '');

async function shinMonth(c: RoyCtx, y: number, m: number, recvFrom: string): Promise<ShinMonth> {
  const nday = new Date(y, m, 0).getDate();
  const end = ymd(y, m, nday);
  const sapo = itemsOf(c, 'sapo');
  const obid = itemsOf(c, 'obid');
  const akao = itemsOf(c, 'akao');
  const kinen = itemsOf(c, 'kdcb').filter(it => cond(it, 'like') != null);
  const byCode = new Map<string, RoyItem>();
  // 現行と同じく、帯留め → 赤帯 → サポーターの順に探す
  for (const it of [...sapo, ...akao, ...obid]) {
    pats(it).forEach(p => byCode.set(p, it));
  }
  const branch = new Map(memsOf(c, 'branch').map(e => [(e.mcode ?? '').trim(), (e.pcode ?? '').trim()]));
  const edas = new Set(memsOf(c, 'eda').map(e => (e.mcode ?? '').trim() + '-' + (e.eda ?? '').trim()));
  const known = new Set(memsOf(c, 'dojo').map(dojoKey));
  const keyOf = (d: RoyDen): string => {
    const n = (d.ncode ?? '').trim();
    if (branch.has(n)) {
      return branch.get(n)!;
    }
    const e = n + '-' + (d.nadr ?? 0);
    return edas.has(e) ? e : n;
  };
  const r: ShinMonth = {
    y, m, nday, det: new Map(), kdet: new Map(), sumK: new Map(), kaiK: new Map(), kaiF: new Map(), excluded: [], unknown: new Map(), lines: 0
  };
  const dom = await c.srv.lines({ daibunrui: { _eq: '100004' }, day: { _gte: recvFrom, _lte: end } });
  const seen = new Set<string>();
  for (const l of dom) {
    const day = shinDay(l.den, l.line, m, nday);
    if (typeof day == 'string') {
      const k = l.denno + day;
      if (!seen.has(k)) {
        seen.add(k);
        r.excluded.push({ denno: l.denno, mcode: (l.den.ncode ?? '').trim(), reason: day, memo: [l.den.dmemo, l.den.nmemo, l.den.cusden, l.den.smemo].map(e => e ?? '').join(' / ') });
      }
      continue;
    }
    if (l.tanka == 0) {
      continue;
    }
    r.lines++;
    const dk = keyOf(l.den);
    const n = l.suu * l.sign;
    const kd = kdKey(l.gcode, l.mmemo, kinen);
    let hit = false;
    if (kd) {
      hit = true;
      r.sumK.set(kd.key, (r.sumK.get(kd.key) ?? 0) + n);
      if (kd.detail) {
        const mp = r.kdet.get(kd.key) ?? new Map<string, number[]>();
        add(mp, dk, day, n, nday);
        r.kdet.set(kd.key, mp);
      }
    } else {
      const it = byCode.get(l.gcode);
      if (it) {
        hit = true;
        const mp = r.det.get(it) ?? new Map<string, number[]>();
        add(mp, dk, day, n, nday);
        r.det.set(it, mp);
      }
    }
    if (hit && !known.has(dk)) {
      r.unknown.set(dk, (r.unknown.get(dk) ?? 0) + n);
    }
  }
  const kai = codesOf(c, 'kaigai');
  if (kai.length) {
    const over = await c.srv.lines({ mcode: { _in: kai }, sday: { _gte: ymd(y, m, 1), _lte: end } });
    for (const l of over) {
      if (l.tanka == 0) {
        continue;
      }
      const n = l.suu * l.sign;
      const kd = kdKey(l.gcode, l.mmemo, kinen);
      if (kd) {
        r.kaiK.set(kd.key, (r.kaiK.get(kd.key) ?? 0) + n);
      } else {
        const it = byCode.get(l.gcode);
        if (it) {
          r.kaiF.set(it.name ?? '', (r.kaiF.get(it.name ?? '') ?? 0) + n);
        }
      }
    }
  }
  return r;
}

/** 国内の、一覧にある支部・道場の数の合計 */
const domQty = (r: ShinMonth, its: RoyItem[], known: Set<string>): number =>
  its.reduce((s, it) => s + [...(r.det.get(it) ?? new Map<string, number[]>()).entries()].filter(([k]) => known.has(k)).reduce((t, [, a]) => t + a.reduce((x, y) => x + y, 0), 0), 0);

/** 日別の明細シート（サポーター・帯留め・赤帯 / 帯・道着） */
function daySheet(wb: Workbook, name: string, header: string, nday: number, lead: string[], rows: { lead: (string | null)[]; days: number[] }[]) {
  const ws = sheet(wb, name);
  const heads = [...lead];
  for (let d = 1; d <= nday; d++) {
    heads.push(String(d));
  }
  heads.push('小計');
  heads.forEach((h, i) => put(ws, 1, i + 1, h));
  head(ws, 1, 1, heads.length);
  const n0 = lead.length;
  rows.forEach((row, i) => {
    const r = i + 2;
    row.lead.forEach((v, j) => put(ws, r, j + 1, v));
    for (let d = 1; d <= nday; d++) {
      if (row.days[d]) {
        put(ws, r, n0 + d, row.days[d]);
      }
    }
    put(ws, r, n0 + nday + 1, fx(`SUM(${at(r, n0 + 1)}:${at(r, n0 + nday)})`, row.days.reduce((a, b) => a + b, 0)));
  });
  const tr = rows.length + 2;
  put(ws, tr, n0, '総計').font = { bold: true };
  for (let col = n0 + 1; col <= n0 + nday + 1; col++) {
    put(ws, tr, col, fx(rows.length ? `SUBTOTAL(9,${at(2, col)}:${at(tr - 1, col)})` : '0'));
  }
  box(ws, 1, 1, tr, heads.length);
  widths(ws, [...lead.map((_, i) => i == n0 - 1 ? 22 : i == 0 ? 24 : 7), ...new Array(nday).fill(4.5), 7]);
  ws.views = [{ state: 'frozen', xSplit: n0, ySplit: 1 }];
  ws.headerFooter = { oddHeader: '&C' + header };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: tr - 1, column: heads.length } };
  printFit(ws, true);
}

/** 新極真会の月の明細 */
export async function shinkyoku(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const r = await shinMonth(c, c.y, c.mth, c.recvFrom);
  const dojos = memsOf(c, 'dojo');
  const known = new Set(dojos.map(dojoKey));
  const dname = new Map(dojos.map(d => [dojoKey(d), d.name ?? '']));
  const sapo = itemsOf(c, 'sapo');
  const obid = itemsOf(c, 'obid');
  const akao = itemsOf(c, 'akao');
  const kdcb = itemsOf(c, 'kdcb');
  const manual = itemsOf(c, 'manual');
  const kd = (key: string) => kdcb.find(e => (e.gcodes ?? '').trim() == key);
  ret.excluded = r.excluded;
  if (r.unknown.size > 0) {
    ret.warns.push('支部・道場の一覧に無い納品先（サポーター・帯留め・赤帯の明細書の数に入らない）: '
      + [...r.unknown.entries()].map(([k, v]) => k + '（' + v + '）').join('、'));
  }
  const red = r.excluded.filter(e => e.reason != '他月受注あり' && e.reason != '伝票備考に「受注」がない').length;
  if (red > 0) {
    ret.warns.push('伝票備考の書き方を直す必要がある伝票が ' + red + ' 件あります（対象外伝票のシート）');
  }
  ret.notes.push('受付日 ' + c.recvFrom.replace(/-/g, '/') + '〜 の伝票から ' + r.lines + ' 行を集計、対象外の伝票 ' + new Set(r.excluded.map(e => e.denno)).size + ' 件');
  const header = c.y + '年' + c.mth + '月分　';
  ret.books.push({
    file: '新極ロイヤリティ_' + c.y + ('0' + c.mth).slice(-2), fill: wb => {
      summarySheet(wb, c, r, known, { sapo, obid, akao, kdcb, manual });
      // 日別の明細（サポーター・帯留め・赤帯）
      const itemRows = (its: RoyItem[]) => its.flatMap(it => dojos.filter(d => r.det.get(it)?.has(dojoKey(d)))
        .map(d => ({ lead: [it.name, it.size, it.color, d.name], days: r.det.get(it)!.get(dojoKey(d))! })));
      daySheet(wb, 'サポーター', header + 'サポーター', r.nday, ['商品名', 'サイズ', '色', '道場名'], itemRows(sapo));
      daySheet(wb, '帯留め', header + '帯留め', r.nday, ['商品名', 'サイズ', '色', '道場名'], itemRows(obid));
      daySheet(wb, '赤帯', header + '赤帯', r.nday, ['商品名', 'サイズ', '色', '道場名'], itemRows(akao));
      // 帯・道着（シート名のある区分から、次のシート名のある区分の前まで）
      const groups: { it: RoyItem; keys: string[] }[] = [];
      for (const it of kdcb) {
        if (it.size) {
          groups.push({ it, keys: [] });
        }
        groups[groups.length - 1]?.keys.push((it.gcodes ?? '').trim());
      }
      for (const g of groups) {
        if (!g.keys.some(k => (r.sumK.get(k) ?? 0) > 0)) {
          continue;
        }
        const rows = g.keys.flatMap(k => dojos.filter(d => r.kdet.get(k)?.has(dojoKey(d)))
          .map(d => ({ lead: [kd(k)?.memo ?? kd(k)?.name ?? k, d.name], days: r.kdet.get(k)!.get(dojoKey(d))! })));
        daySheet(wb, g.it.size ?? '', header + (g.it.color ?? g.it.size ?? ''), r.nday, ['商品名', '道場名'], rows);
      }
      if (r.excluded.length > 0) {
        const ws = sheet(wb, '対象外伝票');
        ['伝票番号', '納品先', '対象外理由', '伝票備考 / 納品書備考 / 受注先伝票番号 / 出荷指示書備考'].forEach((h, i) => put(ws, 1, i + 1, h));
        head(ws, 1, 1, 4);
        r.excluded.forEach((e, i) => {
          put(ws, i + 2, 1, e.denno, '0');
          put(ws, i + 2, 2, (e.mcode ?? '') + ' ' + (dname.get(e.mcode) ?? ''));
          const rc = put(ws, i + 2, 3, e.reason);
          if (e.reason != '他月受注あり' && e.reason != '伝票備考に「受注」がない') {
            rc.font = { color: { argb: 'FFFF0000' } };
          }
          put(ws, i + 2, 4, e.memo);
        });
        box(ws, 1, 1, r.excluded.length + 1, 4);
        widths(ws, [10, 24, 30, 90]);
      }
    }
  });
  return ret;
}

/** ロイヤリティ集計表（国内・海外を並べる） */
function summarySheet(wb: Workbook, c: RoyCtx, r: ShinMonth, known: Set<string>,
  g: { sapo: RoyItem[]; obid: RoyItem[]; akao: RoyItem[]; kdcb: RoyItem[]; manual: RoyItem[] }) {
  const ws = sheet(wb, 'ロイヤリティ集計表');
  widths(ws, [5, 34, 10, 8, 12, 5, 34, 10, 8, 12]);
  merge(ws, 1, 1, 1, 10, c.m.org.dest ?? '').font = { bold: true, size: 13 };
  put(ws, 2, 1, c.y + '年' + c.mth + '月');
  ['国内', '商品名称', 'ロイヤリティ金額', '数量', '合計金額', '海外', '商品名称', 'ロイヤリティ金額', '数量', '合計金額'].forEach((h, i) => put(ws, 3, i + 1, h));
  head(ws, 3, 1, 10);
  /** 名前ごとにまとめた商品（サポーターはサイズ違いが同じ名前） */
  const byName = (its: RoyItem[]) => {
    const names: { name: string; price: number; its: RoyItem[] }[] = [];
    for (const it of its) {
      const e = names.find(n => n.name == (it.name ?? ''));
      if (e) {
        e.its.push(it);
      } else {
        names.push({ name: it.name ?? '', price: it.price ?? 0, its: [it] });
      }
    }
    return names;
  };
  const kdItems = (keys: (k: string) => boolean) => g.kdcb.filter(e => keys((e.gcodes ?? '').trim()));
  type Sec = { label: string; sub: string; rows: { name: string; price: number; dom: number; kai: number }[] };
  const kdRow = (it: RoyItem) => ({ name: it.name ?? '', price: it.price ?? 0, dom: r.sumK.get((it.gcodes ?? '').trim()) ?? 0, kai: r.kaiK.get((it.gcodes ?? '').trim()) ?? 0 });
  const nameRows = (its: RoyItem[]) => byName(its).map(n => ({ name: n.name, price: n.price, dom: domQty(r, n.its, known), kai: r.kaiF.get(n.name) ?? 0 }));
  const secs: Sec[] = [
    { label: 'サポーター', sub: 'サポーター 小計', rows: nameRows(g.sapo) },
    { label: '帯留め', sub: '帯留め 小計', rows: nameRows(g.obid) },
    { label: '赤帯', sub: '赤帯 小計', rows: nameRows(g.akao) },
    { label: '帯', sub: '色帯 小計', rows: kdItems(k => k == 'ZZSK010' || k == 'ZZSK011').map(kdRow) },
    { label: '白帯', sub: '白帯 小計', rows: kdItems(k => k == 'ZZSK001').map(kdRow) },
    { label: '通常道着', sub: '通常道着 小計', rows: kdItems(k => k >= 'ZZSK020' && k <= 'ZZSK101').map(kdRow) },
    { label: '記念道着', sub: '記念道着 小計', rows: kdItems(k => k >= 'ZZSK110').map(kdRow) }
  ];
  // 左（国内）と右（海外）を別々に、数のある行と小計の行だけ書く
  const side = (c0: number, dom: boolean): { subs: Map<string, number>; last: number } => {
    let row = 4;
    const subs = new Map<string, number>();
    for (const s of secs) {
      const first = row;
      for (const e of s.rows) {
        const q = dom ? e.dom : e.kai;
        if (q == 0) {
          continue;
        }
        put(ws, row, c0 + 1, e.name);
        put(ws, row, c0 + 2, e.price);
        put(ws, row, c0 + 3, q, '#,##0.#');
        put(ws, row, c0 + 4, fx(`${at(row, c0 + 2)}*${at(row, c0 + 3)}`, e.price * q));
        row++;
      }
      put(ws, row, c0 + 1, s.sub).font = { bold: true };
      const qs = s.rows.reduce((t, e) => t + (dom ? e.dom : e.kai), 0);
      const am = s.rows.reduce((t, e) => t + e.price * (dom ? e.dom : e.kai), 0);
      put(ws, row, c0 + 3, fx(row > first ? `SUM(${at(first, c0 + 3)}:${at(row - 1, c0 + 3)})` : '0', qs), '#,##0.#');
      put(ws, row, c0 + 4, fx(row > first ? `SUM(${at(first, c0 + 4)}:${at(row - 1, c0 + 4)})` : '0', am));
      for (let col = c0 + 1; col <= c0 + 4; col++) {
        ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      }
      subs.set(s.sub, row);
      row++;
    }
    return { subs, last: row };
  };
  const L = side(1, true);
  const R = side(6, false);
  const subRef = (subs: Map<string, number>, col: number) => [...subs.values()].map(rw => at(rw, col)).join('+');
  const domQ = secs.reduce((t, s) => t + s.rows.reduce((x, e) => x + e.dom, 0), 0);
  const domA = secs.reduce((t, s) => t + s.rows.reduce((x, e) => x + e.dom * e.price, 0), 0);
  const kaiQ = secs.reduce((t, s) => t + s.rows.reduce((x, e) => x + e.kai, 0), 0);
  const kaiA = secs.reduce((t, s) => t + s.rows.reduce((x, e) => x + e.kai * e.price, 0), 0);
  // 国内: アパレル（数は手で入れる）と小計
  let row = L.last;
  const af = row;
  for (const it of g.manual) {
    put(ws, row, 2, it.name);
    put(ws, row, 3, it.price);
    put(ws, row, 4, null);
    put(ws, row, 5, fx(`C${row}*D${row}`, 0));
    row++;
  }
  put(ws, row, 2, 'アパレル 小計').font = { bold: true };
  put(ws, row, 4, fx(row > af ? `SUM(D${af}:D${row - 1})` : '0', 0));
  put(ws, row, 5, fx(row > af ? `SUM(E${af}:E${row - 1})` : '0', 0));
  const appRow = row;
  row++;
  put(ws, row, 2, '小計').font = { bold: true };
  put(ws, row, 4, fx(subRef(L.subs, 4), domQ));
  put(ws, row, 5, fx(subRef(L.subs, 5) + `+E${appRow}`, domA)).font = { bold: true };
  const domTotal = row;
  // 海外: 小計・国内海外合計・消費税
  let rr = R.last;
  put(ws, rr, 7, '小計').font = { bold: true };
  put(ws, rr, 9, fx(subRef(R.subs, 9), kaiQ));
  put(ws, rr, 10, fx(subRef(R.subs, 10), kaiA));
  put(ws, rr + 1, 7, '国内・海外合計').font = { bold: true };
  put(ws, rr + 1, 10, fx(`E${domTotal}+J${rr}`, domA + kaiA)).font = { bold: true };
  put(ws, rr + 2, 8, '消費税');
  put(ws, rr + 2, 9, 0.1, '0%');
  put(ws, rr + 2, 10, fx(`J${rr + 1}*I${rr + 2}`, (domA + kaiA) * 0.1));
  put(ws, rr + 3, 8, '消費税込金額').font = { bold: true };
  put(ws, rr + 3, 10, fx(`J${rr + 1}+J${rr + 2}`, (domA + kaiA) * 1.1)).font = { bold: true };
  rr += 4;
  const bottom = Math.max(row, rr) + 2;
  box(ws, 3, 1, Math.max(row, rr - 1), 10);
  // 国内・海外合計の表
  put(ws, bottom, 8, '商品');
  merge(ws, bottom, 9, bottom, 10, '国内・海外合計');
  put(ws, bottom + 1, 9, '数量');
  put(ws, bottom + 1, 10, '金額');
  head(ws, bottom, 8, 10);
  head(ws, bottom + 1, 8, 10);
  secs.forEach((s, i) => {
    const b = bottom + 2 + i;
    put(ws, b, 8, s.label);
    put(ws, b, 9, fx(`D${L.subs.get(s.sub)}+I${R.subs.get(s.sub)}`, s.rows.reduce((t, e) => t + e.dom + e.kai, 0)), '#,##0.#');
    put(ws, b, 10, fx(`E${L.subs.get(s.sub)}+J${R.subs.get(s.sub)}`, s.rows.reduce((t, e) => t + (e.dom + e.kai) * e.price, 0)));
  });
  box(ws, bottom, 8, bottom + 1 + secs.length, 10);
  const f = bottom + secs.length + 3;
  put(ws, f, 10, c.m.org.greet ?? '').alignment = { horizontal: 'right' };
  put(ws, f + 1, 10, '株式会社 マーシャルワールドジャパン').alignment = { horizontal: 'right' };
  put(ws, f + 2, 10, '担当：' + (c.m.org.tanto ?? '')).alignment = { horizontal: 'right' };
  for (let i = 4; i < f; i++) {
    for (const col of [3, 5, 8, 10]) {
      if (!ws.getCell(i, col).numFmt) {
        ws.getCell(i, col).numFmt = NUM;
      }
    }
  }
  printFit(ws);
}

// ---------------------------------------------------------------------
// 年間集計表（4 月〜 3 月。各月の明細を集計して、支部・道場ごとに並べる）

/** 年間集計表の 1 シートの数（支部・道場 → 12 か月） */
type Year = Map<string, number[]>;

export async function shinAnnual(c: RoyCtx, fy: number, progress: (msg: string) => void): Promise<RoyResult> {
  const ret = empty();
  const dojos = [...memsOf(c, 'dojo')].sort((a, b) => (a.aseq ?? 10000 + a.seq) - (b.aseq ?? 10000 + b.seq));
  const known = new Set(dojos.map(dojoKey));
  const sapo = itemsOf(c, 'sapo');
  const obid = itemsOf(c, 'obid');
  const names = (its: RoyItem[]) => [...new Set(its.map(e => e.name ?? ''))];
  const KAI = '海外支部';
  const sheets: { name: string; data: Year }[] = ['サポーター＋帯留め', '帯', '空手着', '記念道衣 生成り', '記念道衣 晒'].map(name => ({ name, data: new Map() }));
  const addY = (y: Year, k: string, mi: number, n: number) => {
    const a = y.get(k) ?? new Array<number>(12).fill(0);
    a[mi] += n;
    y.set(k, a);
  };
  const kSum = (map: Map<string, number[]>) => {
    const ret2 = new Map<string, number>();
    for (const [k, a] of map) {
      ret2.set(k, (ret2.get(k) ?? 0) + a.reduce((x, y) => x + y, 0));
    }
    return ret2;
  };
  const HALF = ['ZZSK030', 'ZZSK040', 'ZZSK060', 'ZZSK070', 'ZZSK090', 'ZZSK100'];
  const FULL = ['ZZSK020', 'ZZSK050', 'ZZSK080'];
  for (let i = 0; i < 12; i++) {
    const y = i < 9 ? fy : fy + 1;
    const m = (i + 3) % 12 + 1;
    progress(y + '年' + m + '月を集計しています（' + (i + 1) + '/12）…');
    const pm = m == 1 ? 12 : m - 1;
    const py = m == 1 ? y - 1 : y;
    const r = await shinMonth(c, y, m, ymd(py, pm, 15));
    // サポーター＋帯留め
    for (const it of [...sapo, ...obid]) {
      for (const [k, a] of kSum(r.det.get(it) ?? new Map())) {
        if (known.has(k)) {
          addY(sheets[0].data, k, i, a);
        }
      }
    }
    addY(sheets[0].data, KAI, i, [...names(sapo), ...names(obid)].reduce((s, n) => s + (r.kaiF.get(n) ?? 0), 0));
    // 帯・空手着・記念道衣
    const kd = (keys: string[], w: number, sh: Year) => {
      for (const key of keys) {
        for (const [k, a] of kSum(r.kdet.get(key) ?? new Map())) {
          if (known.has(k)) {
            addY(sh, k, i, a * w);
          }
        }
        addY(sh, KAI, i, (r.kaiK.get(key) ?? 0) * w);
      }
    };
    kd(['ZZSK010', 'ZZSK011'], 1, sheets[1].data);
    kd(FULL, 1, sheets[2].data);
    kd(HALF, 0.5, sheets[2].data);
    kd(['ZZSK110'], 1, sheets[3].data);
    kd(['ZZSK120'], 1, sheets[4].data);
  }
  const sumY = (a: Year, b: Year): Year => {
    const ret2: Year = new Map();
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      ret2.set(k, (a.get(k) ?? new Array<number>(12).fill(0)).map((v, i) => v + (b.get(k)?.[i] ?? 0)));
    }
    return ret2;
  };
  const kinen = sumY(sheets[3].data, sheets[4].data);
  sheets.push({ name: '記念道衣 合計', data: kinen }, { name: '空手着 合計', data: sumY(sheets[2].data, kinen) });
  ret.notes.push(fy + '年度（' + fy + '年4月〜' + (fy + 1) + '年3月）の年間集計表を作りました');
  ret.books.push({
    file: '新極ロイヤリティ年間集計表_' + fy, fill: wb => {
      for (const s of sheets) {
        annualSheet(wb, s.name, dojos, s.data, KAI);
      }
    }
  });
  return ret;
}

function annualSheet(wb: Workbook, name: string, dojos: RoyMem[], data: Year, kai: string): Worksheet {
  const ws = sheet(wb, name);
  const heads = ['項', '支部・道場名', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月', '計'];
  heads.forEach((h, i) => put(ws, 1, i + 1, h));
  head(ws, 1, 1, heads.length);
  const rows = [...dojos.map(d => ({ name: d.name ?? '', key: dojoKey(d) })), { name: kai, key: kai }];
  rows.forEach((e, i) => {
    const r = i + 2;
    put(ws, r, 1, i + 1);
    put(ws, r, 2, e.name);
    const a = data.get(e.key) ?? new Array<number>(12).fill(0);
    a.forEach((v, j) => put(ws, r, 3 + j, v, '#,##0.#'));
    put(ws, r, 15, fx(`SUM(C${r}:N${r})`, a.reduce((x, y) => x + y, 0)), '#,##0.#');
  });
  const tr = rows.length + 2;
  put(ws, tr, 2, '計').font = { bold: true };
  for (let col = 3; col <= 15; col++) {
    put(ws, tr, col, fx(`SUM(${at(2, col)}:${at(tr - 1, col)})`), '#,##0.#');
  }
  box(ws, 1, 1, tr, 15);
  widths(ws, [5, 24, ...new Array(12).fill(7), 8]);
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  printFit(ws);
  return ws;
}

export type { RoyLine };
