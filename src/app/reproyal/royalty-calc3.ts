import { RoyItem, RoyLine } from './royalty.service';
import { NUM, XVal, at, box, fx, head, merge, printFit, put, sheet, table, widths } from './royalty-excel';
import { RoyCtx, RoyResult, empty, fileYm, findItem, itemsOf, listSheet, md, memsOf, notZero, pats, simpleStatement, udayIn } from './royalty-calc';

/** 期間の文字（2025/01/01〜2025/06/30） */
const period = (c: RoyCtx): string => md(c.from) + '〜' + md(c.to);
/** ファイル名の期間（202501-202506） */
const fileRange = (c: RoyCtx): string => c.from.slice(0, 7).replace('-', '') + '-' + c.to.slice(0, 7).replace('-', '');
/** 商品コードの * を SQL の % にする（Hasura の _like） */
const sqlLike = (p: string): string => p.replace(/\*/g, '%');
/** 明細の売上日（受注明細の売上日。無ければ伝票の売上日） */
const sdayOf = (l: RoyLine): string => l.sday ?? l.den.sday ?? l.den.uday ?? '';
/** 明細の売上日の期間の条件（受注明細の条件。伝票はその明細があるものだけ読む） */
const sdayIn = (c: RoyCtx) => ({ sday: { _gte: c.from, _lte: c.to } });
const byCode = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

// ---------------------------------------------------------------------
// 極真拳武會（商品コード …-KEN の商品。1 個ごとの金額（税込）× 数量。月ごと）

export async function kenbu(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const all = await c.srv.lines(udayIn(c), { ...notZero, gcode: { _like: '%KEN%' } });
  const lines = all.filter(l => findItem(items, l.gcode));
  // 拳武會の商品（-KEN）なのに、どの行にも入らないもの
  const other = [...new Set(all.filter(l => !findItem(items, l.gcode) && /-KEN(-|$)/.test(l.gcode)).map(l => l.gcode))];
  if (other.length > 0) {
    ret.warns.push('集計していない拳武會の商品（ロイヤリティマスタに無い）: ' + other.join('、'));
  }
  const names = await c.srv.members(lines.map(l => l.den.ncode ?? ''));
  const qty = new Map<RoyItem, number>();
  for (const l of lines) {
    const it = findItem(items, l.gcode)!;
    qty.set(it, (qty.get(it) ?? 0) + l.suu * l.sign);
  }
  const total = items.reduce((s, it) => s + (qty.get(it) ?? 0) * (it.price ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回集計額（税込）' + Math.round(total).toLocaleString() + ' 円');
  ret.books.push({
    file: '極真拳武會ロイヤリティ_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, String(c.y).slice(2) + ('0' + c.mth).slice(-2));
      simpleStatement(ws, c, {
        heads: ['商品', '', '', '数量', '単価(税込)', '合計(税込)', '備考'], widths: [30, 10, 6, 8, 11, 14, 18],
        rows: items.map(it => (r: number) => [it.name, null, null, qty.get(it) ?? 0, it.price,
          fx(`D${r}*E${r}`, (qty.get(it) ?? 0) * (it.price ?? 0)), it.memo]),
        amountCol: 6, totals: 'total', note: '※お支払い金額が\\5,000‐未満の場合は次回繰り越し差せて頂きます。',
        top: total => [
          { c: 1, c2: 2, label: '対象年月', v: null },
          { c: 3, c2: 4, label: '今回集計額(税込)', v: fx(total) },
          { c: 5, c2: 7, label: '今回お支払額(税込)', v: fx(total) }
        ]
      });
      listSheet(wb, ['売上日', '伝票番号', '納品先', '納品先名', '商品コード', '名称', '数量', '税抜金額'],
        lines.map(l => [md(l.den.uday), l.denno, l.den.ncode, names.get(l.den.ncode ?? '')?.name ?? '', l.gcode, l.gtext, l.suu * l.sign, l.toutmoney * l.sign]),
        [undefined, '0', undefined, undefined, undefined, undefined, NUM, NUM]);
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 全硬連（商品の区分ごとのシートに、商品コード・単価ごとの数量。期間は明細の売上日）

export async function zenkoren(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const ps = items.flatMap(it => pats(it));
  if (ps.length == 0) {
    throw new Error('ロイヤリティマスタに商品がありません');
  }
  const lines = (await c.srv.lines({ trjyumeis: sdayIn(c) }, { ...sdayIn(c), _or: ps.map(p => ({ gcode: { _like: sqlLike(p) } })) }))
    .filter(l => findItem(items, l.gcode));
  const grps = [...new Set(items.map(it => it.grp ?? it.name ?? ''))];
  // 区分 → 商品コード/単価 → 数量
  const by = new Map<string, Map<string, { gcode: string; tanka: number; suu: number }>>();
  for (const l of lines) {
    const it = findItem(items, l.gcode)!;
    const g = it.grp ?? it.name ?? '';
    const m = by.get(g) ?? new Map();
    const k = l.gcode + '\t' + l.tanka;
    const e = m.get(k) ?? { gcode: l.gcode, tanka: l.tanka, suu: 0 };
    e.suu += l.suu * l.sign;
    m.set(k, e);
    by.set(g, m);
  }
  const sumOf = (g: string): number => [...(by.get(g)?.values() ?? [])].reduce((s, e) => s + e.suu, 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行（' + grps.map(g => g + ' ' + sumOf(g).toLocaleString()).join('、') + '）');
  ret.books.push({
    file: '全硬連数量集計_' + fileRange(c), fill: wb => {
      const wt = sheet(wb, '集計');
      widths(wt, [16, 30, 12]);
      put(wt, 1, 1, '全硬連 数量集計　' + period(c)).font = { bold: true, size: 13 };
      const rows: { g: string; name: string; row: number }[] = [];
      for (const g of grps) {
        const ws = sheet(wb, g);
        widths(ws, [22, 12, 12]);
        put(ws, 1, 1, period(c));
        const list = [...(by.get(g)?.values() ?? [])].sort((a, b) => byCode(a.gcode, b.gcode) || a.tanka - b.tanka);
        const end = table(ws, 2, 1, ['商品コード', '単価', '数量'], list.map(e => () => [e.gcode, e.tanka, e.suu]), [undefined, NUM, NUM]);
        put(ws, end + 1, 1, '合計').font = { bold: true };
        put(ws, end + 1, 3, fx(list.length ? `SUM(C3:C${end})` : '0', sumOf(g))).font = { bold: true };
        box(ws, end + 1, 1, end + 1, 3);
        ws.autoFilter = { from: 'A2', to: 'C2' };
        ws.views = [{ state: 'frozen', ySplit: 2 }];
        rows.push({ g, name: items.find(it => (it.grp ?? it.name ?? '') == g)?.name ?? '', row: end + 1 });
      }
      table(wt, 3, 1, ['区分', '商品', '数量'], rows.map(e => () => [e.g, e.name, fx(`'${e.g}'!C${e.row}`, sumOf(e.g))]), [undefined, undefined, NUM]);
      printFit(wt);
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// リアル（おちゃのこ（Web）で受注した指定商品の数量。現行は おちゃのこの CSV から集計していた）
//   受注区分 9（Web）の伝票で、楽天（媒体 02・受注番号にハイフン）を除く。期間は受注日。
//   返品伝票は現行の CSV には無いので、別の欄に出す。

const WEB_JCODE = '9';
const RAKUTEN_BKCODE = '02';

export async function real(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const ps = items.flatMap(it => pats(it));
  if (ps.length == 0) {
    throw new Error('ロイヤリティマスタに商品がありません');
  }
  const lines = (await c.srv.lines(
    { jcode: { _eq: WEB_JCODE }, day: { _gte: c.from, _lte: c.to }, _or: [{ bkcode: { _is_null: true } }, { bkcode: { _neq: RAKUTEN_BKCODE } }] },
    { _or: ps.map(p => ({ gcode: { _like: sqlLike(p) } })) }))
    .filter(l => !(l.den.cusden ?? '').includes('-') && findItem(items, l.gcode))
    .sort((a, b) => byCode(a.den.day ?? '', b.den.day ?? '') || a.denno - b.denno || a.line - b.line);
  const names = await c.srv.members(lines.map(l => l.den.mcode ?? ''));
  type Row = { it: RoyItem; gcode: string; suu: number; ret: number; money: number };
  const by = new Map<string, Row>();
  for (const l of lines) {
    const it = findItem(items, l.gcode)!;
    const e = by.get(l.gcode) ?? { it, gcode: l.gcode, suu: 0, ret: 0, money: 0 };
    if (l.sign < 0) {
      e.ret += l.suu;
    } else {
      e.suu += l.suu;
    }
    e.money += l.toutmoney * l.sign;
    by.set(l.gcode, e);
  }
  const order = (r: Row): number => items.indexOf(r.it);
  const rows = [...by.values()].sort((a, b) => order(a) - order(b) || byCode(a.gcode, b.gcode));
  const sum = (f: (r: Row) => number): number => rows.reduce((s, r) => s + f(r), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、数量 ' + sum(r => r.suu).toLocaleString() + '（返品 ' + sum(r => r.ret).toLocaleString() + '）');
  ret.books.push({
    file: (c.m.org.name ?? 'リアル') + '_Web売上_' + fileRange(c), fill: wb => {
      const ws = sheet(wb, '集計');
      widths(ws, [30, 16, 10, 10, 10, 14]);
      put(ws, 1, 1, (c.m.org.name ?? '') + '　おちゃのこ（Web）売上　受注日 ' + period(c)).font = { bold: true, size: 13 };
      const end = table(ws, 3, 1, ['商品', '型番', '数量', '返品', '差引', '税抜金額'],
        rows.map(r => (n: number) => [r.it.name, r.gcode, r.suu, r.ret || null, fx(`C${n}-D${n}`, r.suu - r.ret), r.money]), [undefined, undefined, NUM, NUM, NUM, NUM]);
      const t = end + 1;
      merge(ws, t, 1, t, 2, '総計').font = { bold: true };
      ([[3, sum(r => r.suu)], [4, sum(r => r.ret)], [5, sum(r => r.suu - r.ret)], [6, sum(r => r.money)]] as [number, number][]).forEach(([col, v]) =>
        put(ws, t, col, fx(rows.length ? `SUM(${at(4, col)}:${at(end, col)})` : '0', v)).font = { bold: true });
      box(ws, t, 1, t, 6);
      printFit(ws);
      listSheet(wb, ['受注日', '伝票番号', '受注番号', '会員', '名前', '商品コード', '名称', '数量', '税抜金額', '返品'],
        lines.map(l => [md(l.den.day), l.denno, l.den.cusden, l.den.mcode, names.get(l.den.mcode ?? '')?.name ?? '', l.gcode, l.gtext, l.suu * l.sign, l.toutmoney * l.sign,
          l.sign < 0 ? '返品' : null]), [undefined, '0', undefined, undefined, undefined, undefined, undefined, NUM, NUM]);
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 極真半期（極真会館の道着・帯。卸の顧客（単価区分 2・4）への半年分の数量 × 1 枚ごとの金額）
//   現行の SQL と同じく、明細の売上日が期間内で、商品コードが %KU%-K% / %CBKK1% / %CB-%-K% のもの
//   （-KEN / -KSS / -K-AN を除く、税抜単価 0 を除く）。顧客の種類 exclude の納品先は除く。

const HANKI_LIKE = ['%KU%-K%', '%CBKK1%', '%CB-%-K%'];
const HANKI_NOT = ['%-KEN%', '%-KSS%', '%-K-AN%'];
const HANKI_TANKAKBN = ['2', '4'];

export async function khanki(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const items = itemsOf(c);
  const mw = {
    _and: [sdayIn(c), { _or: HANKI_LIKE.map(p => ({ gcode: { _like: p } })) }, ...HANKI_NOT.map(p => ({ gcode: { _nlike: p } })), { touttanka: { _neq: 0 } }]
  };
  const all = await c.srv.lines({ trjyumeis: mw }, mw);
  const ex = new Set(memsOf(c, 'exclude').map(e => (e.mcode ?? '').trim()).filter(e => e));
  const names = await c.srv.members(all.map(l => l.den.ncode ?? ''));
  const lines = all.filter(l => {
    const nc = (l.den.ncode ?? '').trim();
    return !ex.has(nc) && HANKI_TANKAKBN.includes(names.get(nc)?.tankakbn ?? '');
  }).sort((a, b) => byCode(sdayOf(a), sdayOf(b)) || byCode(a.gcode, b.gcode) || byCode(names.get(a.den.ncode ?? '')?.name ?? '', names.get(b.den.ncode ?? '')?.name ?? ''));
  const nameOf = (l: RoyLine): string => names.get(l.den.ncode ?? '')?.fullname ?? l.den.ncode ?? '';
  const unknown = [...new Set(lines.filter(l => !findItem(items, l.gcode)).map(l => l.gcode))];
  if (unknown.length > 0) {
    ret.warns.push('どの区分にも入らない商品（数えていない）: ' + unknown.join('、'));
  }
  const isObi = (it: RoyItem | null): boolean => (it?.grp ?? '') == 'obi';
  const qty = new Map<RoyItem, number>();
  const piv = new Map<string, [number, number]>();
  for (const l of lines) {
    const it = findItem(items, l.gcode);
    const q = l.suu * l.sign;
    if (it) {
      qty.set(it, (qty.get(it) ?? 0) + q);
    }
    const p = piv.get(nameOf(l)) ?? [0, 0];
    p[isObi(it) ? 0 : 1] += q;
    piv.set(nameOf(l), p);
  }
  const total = items.reduce((s, it) => s + (qty.get(it) ?? 0) * (it.price ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行（' + items.map(it => (it.name ?? '') + ' ' + (qty.get(it) ?? 0).toLocaleString()).join('、')
    + '）、ロイヤリティ ' + Math.round(total).toLocaleString() + ' 円');
  ret.books.push({
    file: '極真道着帯ロイヤリティ_' + fileRange(c), fill: wb => {
      const ws = sheet(wb, '極真道着帯ロイヤリティ');
      widths(ws, [14, 22, 8, 30, 8, 14, 12]);
      put(ws, 1, 1, '極真 道着・帯ロイヤリティ　' + period(c)).font = { bold: true, size: 13 };
      // 明細（9 行目から）
      const lr = 8;
      const first = lr + 1;
      const end = table(ws, lr, 1, ['売上日', '商品コード', '数量', '登録名', '種別', '区分'],
        lines.map(l => () => {
          const it = findItem(items, l.gcode);
          return [md(sdayOf(l)), l.gcode, l.suu * l.sign, nameOf(l), isObi(it) ? '帯' : '道着', it?.name ?? ''];
        }), [undefined, undefined, NUM]);
      const last = Math.max(end, first);
      // 集計（区分の名前で、明細の区分の欄を数える）
      ['', '集計', '単価', 'ロイヤリティ', '', 'ロイヤリティ'].forEach((t, i) => t && put(ws, 2, 1 + i, t));
      head(ws, 2, 1, 4);
      head(ws, 2, 6, 6);
      items.forEach((it, i) => {
        const r = 3 + i;
        put(ws, r, 1, it.name);
        put(ws, r, 2, fx(`SUMIF($F$${first}:$F$${last},A${r},$C$${first}:$C$${last})`, qty.get(it) ?? 0));
        put(ws, r, 3, it.price);
        put(ws, r, 4, fx(`B${r}*C${r}`, (qty.get(it) ?? 0) * (it.price ?? 0)));
      });
      const ie = 2 + items.length;
      box(ws, 2, 1, ie, 4);
      put(ws, 3, 6, fx(`SUM(D3:D${ie})`, total)).font = { bold: true };
      box(ws, 2, 6, 3, 6);
      ws.autoFilter = { from: at(lr, 1), to: at(lr, 6) };
      // 納品先ごと（帯・道着の数）
      const wp = sheet(wb, '道着帯集計');
      widths(wp, [36, 10, 10, 10]);
      put(wp, 1, 1, period(c));
      const ps = [...piv.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja'));
      const pe = table(wp, 3, 1, ['納品先', '帯', '道着', '総計'], ps.map(([n, v]) => (r: number) => [n, v[0] || null, v[1] || null, fx(`SUM(B${r}:C${r})`, v[0] + v[1])]),
        [undefined, NUM, NUM, NUM]);
      const sums: XVal[] = [0, 1].map(k => fx(ps.length ? `SUM(${at(4, 2 + k)}:${at(pe, 2 + k)})` : '0', ps.reduce((s, e) => s + e[1][k], 0)));
      merge(wp, pe + 1, 1, pe + 1, 1, '総計').font = { bold: true };
      put(wp, pe + 1, 2, sums[0]);
      put(wp, pe + 1, 3, sums[1]);
      put(wp, pe + 1, 4, fx(`SUM(B${pe + 1}:C${pe + 1})`, ps.reduce((s, e) => s + e[1][0] + e[1][1], 0)));
      box(wp, pe + 1, 1, pe + 1, 4);
      wp.views = [{ state: 'frozen', ySplit: 3 }];
    }
  });
  return ret;
}
