import type { Workbook, Worksheet } from 'exceljs';
import { RoyItem, RoyLine } from './royalty.service';
import { NUM, MW_INFO, XVal, at, box, footer, fx, greet, head, letterHead, merge, printFit, put, sheet, summary, table, widths } from './royalty-excel';
import { RoyCtx, RoyResult, codesOf, cond, empty, fileYm, findItem, itemsOf, like, md, memsOf, pats, r1, simpleStatement, udayIn, ymLabel } from './royalty-calc';

// ---------------------------------------------------------------------
// 大道塾（大分類 100014 の伝票。オフィシャル商品は 事務局の価格 と 支部・道場・同好会の価格 の差額。
// それ以外の商品（Z を除く）は MW商品購入として、税抜金額 × 率）

/** 伝票の中分類の名前から、区分（0 事務局 / 1 支部 / 2 道場 / 3 同好会 / -1 不明） */
function daidoKind(name: string): number {
  if (name.includes('同好会')) {
    return 3;
  }
  if (name.includes('道場')) {
    return 2;
  }
  if (name.includes('支部')) {
    return 1;
  }
  if (name.includes('事務局')) {
    return 0;
  }
  return -1;
}

export async function daido(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const lines = await c.srv.lines({ ...udayIn(c), daibunrui: { _eq: '100014' } });
  const all = itemsOf(c);
  const items = all.filter(e => e.grp != 'mw' && e.grp != 'oem');
  const mw = all.find(e => e.grp == 'mw');
  const oems = all.filter(e => e.grp == 'oem');
  const qty = new Map<RoyItem, number[]>();
  let mwQty = 0;
  let mwAmt = 0;
  const unknown = new Set<string>();
  const names = await c.srv.members(lines.map(l => l.den.mcode ?? ''));
  for (const l of lines) {
    const kname = c.chuName(l.den.chubunrui);
    const k = daidoKind(kname);
    if (k < 0) {
      unknown.add((l.den.chubunrui ?? '') + ' ' + kname);
    }
    const it = findItem(items, l.gcode);
    if (it) {
      if (k > 0) {
        const q = qty.get(it) ?? [0, 0, 0];
        q[k - 1] += l.suu * l.sign;
        qty.set(it, q);
      }
    } else if (!like(l.gcode, 'Z*') && k > 0) {
      mwQty += l.suu * l.sign;
      mwAmt += l.toutmoney * l.sign;
    }
  }
  if (unknown.size > 0) {
    ret.warns.push('支部・道場・同好会・事務局のどれか分からない中分類（集計していない）: ' + [...unknown].join('、'));
  }
  const yymm = String(c.y).slice(2) + ('0' + c.mth).slice(-2);
  const diff = (it: RoyItem): number => {
    const q = qty.get(it) ?? [0, 0, 0];
    const base = (it.price ?? 0) * (q[0] + q[1] + q[2]);
    return (it.price2 ?? 0) * q[0] + (it.price3 ?? 0) * q[1] + (it.price4 ?? 0) * q[2] - base;
  };
  const off = items.reduce((s, it) => s + diff(it), 0);
  const mwRoy = Math.floor(mwAmt * (mw?.rate ?? 0));
  const net = off + mwRoy;
  ret.notes.push('対象の明細 ' + lines.length + ' 行、差額分 ' + Math.round(off).toLocaleString() + ' 円、MW商品購入 ' + mwAmt.toLocaleString() + ' 円 × ' + (mw?.rate ?? 0)
    + '、今回集計額（税込）' + (net + Math.floor(net * 0.1)).toLocaleString() + ' 円');
  ret.books.push({
    file: '大道塾ロイヤリティ_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, yymm);
      const wd = sheet(wb, '集計詳細' + yymm);
      // 集計詳細（品番ごと）
      widths(wd, [4, 6, 20, 16, 9, 9, 9, 9, 7, 7, 8, 7, 11, 11, 11, 11, 11]);
      put(wd, 1, 2, ymLabel(c) + '　集計詳細').font = { bold: true };
      const h1: [number, number, string][] = [[2, 3, '商品名'], [4, 4, '品番'], [5, 8, '価格'], [9, 12, '販売数量'], [13, 16, '販売価格集計'], [17, 17, '差額分']];
      h1.forEach(([a, b, t]) => merge(wd, 2, a, 2, b, t));
      ['事務局', '支部', '道場', '同好会', '支部', '道場', '同好会', '合計', '合計', '支部', '道場', '同好会'].forEach((t, i) => put(wd, 3, 5 + i, t));
      head(wd, 2, 2, 17);
      head(wd, 3, 2, 17);
      let r = 4;
      let prev = '';
      let no = 0;
      const grpRows = new Map<string, number[]>();
      for (const it of items) {
        const g = it.grp ?? '';
        if (g != prev) {
          put(wd, r, 2, '■　' + g);
          r++;
          prev = g;
        }
        const q = qty.get(it) ?? [0, 0, 0];
        put(wd, r, 2, ++no);
        put(wd, r, 3, it.name);
        put(wd, r, 4, pats(it)[0] ?? '');
        [it.price, it.price2, it.price3, it.price4].forEach((p, i) => put(wd, r, 5 + i, p));
        q.forEach((v, i) => put(wd, r, 9 + i, v || null));
        put(wd, r, 12, fx(`SUM(I${r}:K${r})`, q[0] + q[1] + q[2]));
        put(wd, r, 13, fx(`E${r}*L${r}`, (it.price ?? 0) * (q[0] + q[1] + q[2])));
        put(wd, r, 14, fx(`F${r}*I${r}`, (it.price2 ?? 0) * q[0]));
        put(wd, r, 15, fx(`G${r}*J${r}`, (it.price3 ?? 0) * q[1]));
        put(wd, r, 16, fx(`H${r}*K${r}`, (it.price4 ?? 0) * q[2]));
        put(wd, r, 17, fx(`(N${r}+O${r}+P${r})-M${r}`, diff(it)));
        grpRows.set(g, [...(grpRows.get(g) ?? []), r]);
        r++;
      }
      put(wd, r, 2, '総合計');
      for (const col of [13, 14, 15, 16, 17]) {
        put(wd, r, col, fx(`SUM(${at(4, col)}:${at(r - 1, col)})`));
      }
      box(wd, 2, 2, r, 17);
      printFit(wd, true);
      // 明細書
      widths(ws, [30, 14, 14, 10, 14, 6, 6, 8, 12, 10]);
      const last = 10;
      let s = letterHead(ws, 'ロイヤリティー明細書', c.m.org, last);
      const top = s;
      s += 2;
      put(ws, s, last, '※お支払い金額が\\5,000‐未満の場合は次回繰り越し差せて頂きます。').alignment = { horizontal: 'right' };
      s = greet(ws, s + 2, c.m.org, last);
      put(ws, s, 1, '商品集計').font = { bold: true };
      s++;
      merge(ws, s, 1, s, 3, '商品');
      put(ws, s, 4, '数量');
      merge(ws, s, 5, s, 7, '合計(税抜)');
      merge(ws, s, 8, s, 10, '備考');
      head(ws, s, 1, 10);
      const first = s + 1;
      s++;
      const ref = (col: string, rows: number[]): string => rows.length == 1 ? `'集計詳細${yymm}'!${col}${rows[0]}` : `SUM('集計詳細${yymm}'!${col}${rows[0]}:${col}${rows[rows.length - 1]})`;
      for (const [g, rows] of grpRows) {
        const its = items.filter(e => (e.grp ?? '') == g);
        merge(ws, s, 1, s, 3, g);
        put(ws, s, 4, fx(ref('L', rows), its.reduce((t, it) => t + (qty.get(it) ?? [0, 0, 0]).reduce((a, b) => a + b, 0), 0)));
        merge(ws, s, 5, s, 7, fx(ref('Q', rows), its.reduce((t, it) => t + diff(it), 0)));
        s++;
      }
      s++;
      merge(ws, s, 1, s, 3, mw?.name ?? 'MW商品購入');
      put(ws, s, 4, mwQty);
      merge(ws, s, 5, s, 7, fx(`ROUNDDOWN(H${s}*I${s},0)`, mwRoy));
      put(ws, s, 8, mw?.rate ?? 0, '0%');
      put(ws, s, 9, mwAmt);
      s++;
      merge(ws, s, 1, s, 3, 'OEMアパレル');
      s++;
      for (const o of oems) {
        merge(ws, s, 1, s, 3, o.name);
        put(ws, s, 4, null);
        merge(ws, s, 5, s, 7, fx(`D${s}*J${s}`, 0));
        put(ws, s, 8, o.memo);
        put(ws, s, 10, o.price);
        s++;
      }
      const end = s - 1;
      merge(ws, s, 1, s, 4, '10%対象');
      merge(ws, s, 5, s, 7, fx(`SUM(E${first}:E${end})`, net));
      merge(ws, s + 1, 1, s + 1, 4, '10％消費税');
      merge(ws, s + 1, 5, s + 1, 7, fx(`ROUNDDOWN(E${s}*0.1,0)`, Math.floor(net * 0.1)));
      merge(ws, s + 2, 1, s + 2, 4, '合計額');
      merge(ws, s + 2, 5, s + 2, 7, fx(`E${s}+E${s + 1}`, net + Math.floor(net * 0.1)));
      box(ws, first - 1, 1, s + 2, 10);
      const total = `E${s + 2}`;
      summary(ws, top, [
        { c: 1, label: '対象年月', v: ymLabel(c) },
        { c: 2, label: '今回集計額(税込)', v: fx(total) },
        { c: 3, c2: 4, label: '御請求額(税込)', v: null },
        { c: 5, c2: 6, label: '請求額相殺後合計(税込)', v: fx(`B${top + 1}-C${top + 1}`) },
        { c: 7, c2: 10, label: '※今回御支払金額合計(税込)', v: fx(`IF(E${top + 1}<0,0,E${top + 1})`) }
      ]);
      footer(ws, s + 4, c.m.org, last);
      printFit(ws);
      // 売上一覧（現行の売上ファイル）
      const wl = sheet(wb, '売上一覧');
      table(wl, 1, 1, ['伝票番号', '区分', '受注先', '氏名', '商品コード', '商品名', '数量', '税抜単価', '税抜金額', '売上日'],
        lines.map(l => () => [l.denno, c.chuName(l.den.chubunrui), l.den.mcode, names.get(l.den.mcode ?? '')?.name ?? '', l.gcode, l.gtext,
          l.suu * l.sign, l.suu ? r1(l.toutmoney / l.suu) : l.tanka, l.toutmoney * l.sign, md(l.den.uday)]),
        ['0', undefined, undefined, undefined, undefined, undefined, NUM, NUM, NUM]);
      widths(wl, [10, 10, 10, 18, 20, 34, 7, 10, 11, 11]);
      wl.views = [{ state: 'frozen', ySplit: 1 }];
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// 極真連合会・関西総本部（大分類 100003、中分類 013・121 の伝票）
//   極真連合会本部: 帯・道着・審判用品のコミッション
//   関西総本部: 請求先の顧客マスタ備考に「関西総本部」がある伝票の差額、グラチャン指定、ファールカップ

/** 明細のシート（帯・道着）。合計の行の番号を返す */
function rengoList(ws: Worksheet, rows: { l: RoyLine; suu: number; name: string }[], start = 2): number {
  const heads = ['売上日', '伝票番号', '氏名', '商品コード', '名称', '数量'];
  heads.forEach((h, i) => put(ws, start, i + 1, h));
  head(ws, start, 1, 6);
  rows.forEach((e, i) => {
    const r = start + 1 + i;
    [md(e.l.den.uday), e.l.denno, e.name, e.l.gcode, e.l.gtext, e.suu].forEach((v, j) => put(ws, r, j + 1, v, j == 1 ? '0' : j == 5 ? '#,##0.#' : undefined));
  });
  const tr = start + rows.length + 1;
  put(ws, tr, 5, '合計').font = { bold: true };
  put(ws, tr, 6, fx(rows.length ? `SUM(F${start + 1}:F${tr - 1})` : '0', rows.reduce((s, e) => s + e.suu, 0)), '#,##0.#');
  box(ws, start, 1, tr, 6);
  return tr;
}
/** コミッションのお知らせの欄 */
function rengoNotice(ws: Worksheet, r: number, mth: number, dest: string, label: string, v: XVal) {
  put(ws, r, 3, mth + '月分').font = { bold: true, size: 14 };
  put(ws, r + 1, 2, dest).font = { bold: true, size: 13 };
  put(ws, r + 2, 2, label);
  put(ws, r + 2, 5, v).font = { bold: true, size: 13 };
  put(ws, r + 3, 6, 'マーシャルワールド');
}

export async function rengo(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const lines = await c.srv.lines({ ...udayIn(c), daibunrui: { _eq: '100003' }, chubunrui: { _in: ['013', '121'] }, day: { _gt: '2024-01-19' } });
  const members = await c.srv.members(lines.map(l => l.den.scde ?? ''));
  const kansaiText = memsOf(c, 'kansai')[0]?.name ?? '関西総本部';
  const tabataText = memsOf(c, 'tabata')[0]?.name ?? '田畑師範';
  const grachanM = codesOf(c, 'grachan')[0] ?? '';
  const obi = itemsOf(c, 'obi');
  const dogi = itemsOf(c, 'dogi');
  const shinpan = itemsOf(c, 'shinpan');
  const kansai = itemsOf(c, 'kansai');
  const grachan = itemsOf(c, 'grachan');
  const cups = itemsOf(c, 'cup');
  type Row = { l: RoyLine; suu: number; name: string };
  const obiRows: Row[] = [];
  const dogiRows: Row[] = [];
  const shin = new Map<RoyItem, Row[]>(shinpan.map(it => [it, []]));
  const kRows: { r: Row; unit: number }[] = [];
  for (const l of lines) {
    const mem = members.get(l.den.scde ?? '');
    const name = mem?.name ?? '';
    const suu = l.suu * l.sign;
    if (findItem(obi, l.gcode)) {
      obiRows.push({ l, suu, name });
    } else if (findItem(dogi, l.gcode)) {
      dogiRows.push({ l, suu: r1(suu * (like(l.gcode, '*U') ? 0.6 : like(l.gcode, '*S') ? 0.4 : 1)), name });
    } else {
      const it = findItem(shinpan, l.gcode);
      if (it) {
        shin.get(it)!.push({ l, suu, name });
      }
    }
    if ((mem?.memo ?? '').includes(kansaiText)) {
      const it = kansai.find(k => pats(k).includes(l.gcode));
      if (it) {
        const unit = it.price2 != null && it.price3 != null ? r1(it.price3 - it.price2) : (it.price ?? 0);
        kRows.push({ r: { l, suu, name }, unit });
      }
    }
  }
  // グラチャン指定（すべての受注先の売上）
  const gcodes = grachan.flatMap(pats);
  const glines = gcodes.length ? await c.srv.lines(udayIn(c), { gcode: { _in: gcodes } }) : [];
  const gmem = await c.srv.members(glines.map(l => l.den.scde ?? ''));
  const gq = new Map<RoyItem, { suu: number; q90943: number }>();
  for (const it of grachan) {
    const ls = glines.filter(l => pats(it).includes(l.gcode));
    const s = (f: (l: RoyLine) => boolean) => ls.filter(f).reduce((t, l) => t + l.suu * l.sign, 0);
    const tabata = s(l => (gmem.get(l.den.scde ?? '')?.memo ?? '').includes(tabataText));
    const chu = cond(it, 'chubunrui');
    const base = chu ? s(l => chu.includes((l.den.chubunrui ?? '').trim())) : s(() => true);
    gq.set(it, { suu: base - tabata, q90943: s(l => (l.den.mcode ?? '').trim() == grachanM) });
  }
  // ファールカップ（明細の出荷日が対象の月。単価が定価より安いものは卸）
  const cupPats = [...new Set(cups.flatMap(pats))];
  const cupWhere = { _and: [{ sday: { _gte: c.from, _lte: c.to } }, { _or: cupPats.map(p => ({ gcode: { _like: p.replace(/\*/g, '%') } })) }] };
  const clines = cupPats.length ? await c.srv.lines({ trjyumeis: cupWhere }, cupWhere) : [];
  const cq = new Map<RoyItem, number>();
  for (const l of clines) {
    const unit = l.suu ? l.toutmoney / l.suu : 0;
    if (unit <= 0) {
      continue;
    }
    const group = cups.filter(it => pats(it).some(p => like(l.gcode, p)));
    const th = group[0]?.price2 ?? 0;
    const it = group.find(e => cond(e, unit < th ? 'oroshi' : 'teika') != null);
    if (it) {
      cq.set(it, (cq.get(it) ?? 0) + l.suu * l.sign);
    }
  }
  const sum = (rows: Row[]) => rows.reduce((s, e) => s + e.suu, 0);
  const obiAmt = r1(sum(obiRows) * (obi[0]?.price ?? 0) * 1.1);
  const dogiAmt = r1(sum(dogiRows) * (dogi[0]?.price ?? 0) * 1.1);
  const shinAmt = shinpan.reduce((s, it) => s + sum(shin.get(it)!) * (it.price ?? 0), 0);
  const kAmt = kRows.reduce((s, e) => s + e.r.suu * e.unit, 0) + grachan.reduce((s, it) => s + (gq.get(it)?.suu ?? 0) * (it.price ?? 0), 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行。極真連合会本部: 帯 ' + obiAmt.toLocaleString() + ' 円・道着 ' + dogiAmt.toLocaleString() + ' 円・審判用品 ' + shinAmt.toLocaleString()
    + ' 円。関西総本部: ' + Math.round(kAmt).toLocaleString() + ' 円');
  ret.books.push({
    file: '極真連合会本部コミッション_' + fileYm(c), fill: wb => {
      const w1 = sheet(wb, '帯');
      widths(w1, [11, 10, 20, 16, 30, 8]);
      let tr = rengoList(w1, obiRows);
      rengoNotice(w1, tr + 2, c.mth, c.m.org.dest ?? '', '帯コミッション', fx(`F${tr}*${obi[0]?.price ?? 0}*1.1`, obiAmt));
      const w2 = sheet(wb, '道着');
      widths(w2, [11, 10, 20, 16, 30, 8]);
      tr = rengoList(w2, dogiRows);
      rengoNotice(w2, tr + 2, c.mth, c.m.org.dest ?? '', '道着コミッション', fx(`F${tr}*${dogi[0]?.price ?? 0}*1.1`, dogiAmt));
      const w3 = sheet(wb, '審判用品');
      widths(w3, [11, 10, 20, 16, 30, 8]);
      let r = 1;
      const totals: { it: RoyItem; row: number }[] = [];
      for (const it of shinpan) {
        put(w3, r, 1, it.name).font = { bold: true };
        tr = rengoList(w3, shin.get(it)!, r + 1);
        totals.push({ it, row: tr });
        r = tr + 2;
      }
      put(w3, r, 3, c.mth + '月分').font = { bold: true, size: 14 };
      put(w3, r + 1, 2, c.m.org.dest ?? '').font = { bold: true, size: 13 };
      r += 2;
      const first = r;
      for (const t of totals) {
        put(w3, r, 2, t.it.name);
        put(w3, r, 5, fx(`F${t.row}*${t.it.price ?? 0}`, sum(shin.get(t.it)!) * (t.it.price ?? 0)));
        r++;
      }
      put(w3, r, 2, '合計');
      put(w3, r, 5, fx(`SUM(E${first}:E${r - 1})`, shinAmt)).font = { bold: true };
      put(w3, r + 1, 6, 'マーシャルワールド');
      const w4 = sheet(wb, '合計');
      widths(w4, [20, 14]);
      [['帯', obiAmt], ['道着', dogiAmt], ['審判ｼｬﾂ・ネクタイ', shinAmt]].forEach(([t, v], i) => {
        put(w4, i + 1, 1, t as string);
        put(w4, i + 1, 2, v as number);
      });
      put(w4, 5, 1, '合計').font = { bold: true };
      put(w4, 5, 2, fx('SUM(B1:B4)', obiAmt + dogiAmt + shinAmt)).font = { bold: true };
      [w1, w2, w3].forEach(w => printFit(w));
    }
  });
  ret.books.push({
    file: '関西総本部コミッション_' + fileYm(c), fill: wb => {
      const ws = sheet(wb, '関西総本部');
      widths(ws, [11, 10, 20, 16, 26, 8, 12, 12]);
      const heads = ['売上日', '伝票番号', '氏名', '商品コード', '名称', '数量', 'コミッション単価', '金額'];
      heads.forEach((h, i) => put(ws, 2, i + 1, h));
      head(ws, 2, 1, 8);
      let r = 3;
      for (const e of kRows) {
        [md(e.r.l.den.uday), e.r.l.denno, e.r.name, e.r.l.gcode, e.r.l.gtext, e.r.suu, e.unit].forEach((v, j) => put(ws, r, j + 1, v, j == 1 ? '0' : undefined));
        put(ws, r, 8, fx(`F${r}*G${r}`, e.r.suu * e.unit));
        r++;
      }
      let prev = '';
      for (const it of grachan) {
        const q = gq.get(it)!;
        if ((it.name ?? '') != prev) {
          put(ws, r, 1, '集計');
          prev = it.name ?? '';
        }
        put(ws, r, 4, pats(it)[0] ?? '');
        put(ws, r, 5, it.name);
        put(ws, r, 6, q.suu);
        put(ws, r, 7, q.q90943);
        put(ws, r, 8, fx(`F${r}*${it.price ?? 0}`, q.suu * (it.price ?? 0)));
        r++;
      }
      put(ws, r, 7, '小計');
      put(ws, r, 8, fx(`SUM(H3:H${r - 1})`, kAmt)).font = { bold: true };
      box(ws, 2, 1, r, 8);
      put(ws, r + 2, 3, c.mth + '月分').font = { bold: true, size: 14 };
      put(ws, r + 3, 4, '極真会館関西総本部').font = { bold: true, size: 13 };
      put(ws, r + 4, 4, '今回お支払い額');
      put(ws, r + 4, 6, fx(`H${r}`, kAmt)).font = { bold: true, size: 13 };
      put(ws, r + 5, 5, 'マーシャルワールド');
      put(ws, 1, 1, '「集計」の行: 数量 = グラチャン指定の数（田畑師範の分を除く）、コミッション単価の欄 = 受注先 ' + grachanM + ' の数');
      printFit(ws);
      const wf = sheet(wb, 'ファールカップ');
      simpleStatement(wf, c, {
        dest: c.m.org.dest2,
        heads: ['商品', '', '', '数量', '単価', '価格', '備考'], widths: [20, 12, 10, 8, 10, 14, 16],
        rows: cups.map(it => (rr: number) => [it.name, null, null, cq.get(it) ?? null, it.price, fx(`D${rr}*E${rr}`, (cq.get(it) ?? 0) * (it.price ?? 0)), it.memo]),
        amountCol: 6, totals: 'total',
        top: (total, vr) => [
          { c: 1, label: '対象年月', v: null },
          { c: 2, c2: 3, label: '今回集計額', v: fx(total) },
          { c: 4, c2: 5, label: '御請求額', v: null },
          { c: 6, c2: 7, label: 'ロイヤリティ金額', v: fx(`B${vr}-D${vr}`) }
        ]
      });
    }
  });
  return ret;
}

// ---------------------------------------------------------------------
// JKJO・JKC（納品先ごとのシート。大会の数は 2/3（切り捨て）を JKJO・JKC の報告書に入れる）

export async function jkjo(c: RoyCtx): Promise<RoyResult> {
  const ret = empty();
  const jk = itemsOf(c, 'JK');
  const jc = itemsOf(c, 'JC');
  const all = [...jk, ...jc];
  const codes = all.flatMap(pats);
  const taikai = memsOf(c, 'taikai');
  const sheets = [...taikai, ...memsOf(c, 'sheet')];
  const lines = await c.srv.lines({ ...udayIn(c), ncode: { _in: sheets.map(e => (e.mcode ?? '').trim()) } }, { gcode: { _in: codes } });
  const per = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const k = (l.den.ncode ?? '').trim();
    const m = per.get(k) ?? new Map<string, number>();
    m.set(l.gcode, (m.get(l.gcode) ?? 0) + l.suu * l.sign);
    per.set(k, m);
  }
  const dic = new Map<string, number>();
  for (const s of sheets) {
    const m = per.get((s.mcode ?? '').trim()) ?? new Map<string, number>();
    const isT = s.kind == 'taikai';
    for (const code of codes) {
      const q = m.get(code) ?? 0;
      dic.set(code, (dic.get(code) ?? 0) + (isT ? Math.floor(q * 2 / 3) : q));
    }
  }
  const total = (its: RoyItem[], q: (code: string) => number) => its.reduce((s, it) => s + q(pats(it)[0] ?? '') * (it.price ?? 0), 0) * 1.1;
  const jkjoT = total(jk, k => dic.get(k) ?? 0);
  const jkcT = total(jc, k => dic.get(k) ?? 0);
  const tq = per.get((taikai[0]?.mcode ?? '').trim()) ?? new Map<string, number>();
  const taiT = total(all, k => tq.get(k) ?? 0);
  ret.notes.push('対象の明細 ' + lines.length + ' 行、今回御支払金額合計（税込）' + Math.round((jkjoT + jkcT + taiT) * 0.1).toLocaleString() + ' 円');
  const ld = new Date(c.y, c.mth, 0).getDate();
  const totalRow = (n: number) => 13 + n;
  ret.books.push({
    file: 'JKJO_JKCロイヤリティ計算報告書_' + fileYm(c), fill: wb => {
      const jkName = 'JKJO報告書';
      const jcName = 'JKC報告書';
      const taiName = taikai[0]?.name ?? '大会';
      const write = (name: string, title: string, its: RoyItem[], q: (code: string) => number, others: [string, number, number][], bank: string | null) => {
        const ws = sheet(wb, name);
        widths(ws, [22, 12, 14, 16]);
        put(ws, 1, 1, c.m.org.regno ?? '');
        put(ws, 1, 4, new Date(), 'yyyy/m/d');
        put(ws, 2, 1, c.y + '年' + c.mth + '月度' + title + '商品ロイヤリティ計算報告書').font = { bold: true, size: 14 };
        put(ws, 3, 1, c.m.org.dest ?? '').font = { bold: true, size: 12 };
        put(ws, 4, 1, '対象期間:' + c.y + '年' + c.mth + '月1日～' + c.mth + '月' + ld + '日');
        MW_INFO.forEach((t, i) => put(ws, 3 + i, 4, t));
        const own = its.reduce((s, it) => s + q(pats(it)[0] ?? '') * (it.price ?? 0), 0) * 1.1;
        const tr = totalRow(its.length);
        const f = [`D${tr}*0.1`, ...others.map(([sh, row]) => `'${sh}'!D${row}*0.1`)].join('+');
        const v = r1((own + others.reduce((s, o) => s + o[2], 0)) * 0.1);
        put(ws, 6, 1, 'JKJO事務局様御支払金額(税込)');
        put(ws, 6, 2, fx('ROUNDUP(B8*0.8,0)', Math.ceil(v * 0.8)));
        put(ws, 7, 1, 'JKC事務局様御支払金額(税込)');
        put(ws, 7, 2, fx('B8-B6', r1(v - Math.ceil(v * 0.8))));
        put(ws, 8, 1, '今回御支払金額合計(税込)').font = { bold: true };
        put(ws, 8, 2, fx(f, r1(v))).font = { bold: true };
        put(ws, 8, 4, '担当:' + (c.m.org.tanto ?? ''));
        box(ws, 6, 1, 8, 2);
        const end = table(ws, 10, 1, ['商品コード', '数量', '税抜単価', '小計'],
          its.map(it => (r: number) => [pats(it)[0] ?? '', q(pats(it)[0] ?? ''), it.price, fx(`B${r}*C${r}`, q(pats(it)[0] ?? '') * (it.price ?? 0))]));
        const sub = its.reduce((s, it) => s + q(pats(it)[0] ?? '') * (it.price ?? 0), 0);
        put(ws, end + 1, 3, '10％対象');
        put(ws, end + 1, 4, fx(`SUM(D11:D${end})`, sub));
        put(ws, end + 2, 3, '10％消費税');
        put(ws, end + 2, 4, fx(`D${end + 1}*0.1`, r1(sub * 0.1)));
        put(ws, end + 3, 3, '総計').font = { bold: true };
        put(ws, end + 3, 4, fx(`D${end + 1}+D${end + 2}`, r1(sub * 1.1))).font = { bold: true };
        box(ws, end + 1, 3, end + 3, 4);
        if (bank) {
          const c1 = merge(ws, end + 1, 1, end + 3, 2, bank);
          c1.alignment = { wrapText: true, vertical: 'top' };
        }
        const g = merge(ws, end + 5, 1, end + 9, 4, c.m.org.greet ?? '');
        g.alignment = { wrapText: true, vertical: 'top' };
        printFit(ws);
      };
      write(jkName, 'JKJO', jk, k => dic.get(k) ?? 0, [[taiName, totalRow(all.length), taiT], [jcName, totalRow(jc.length), jkcT]], c.m.org.bank);
      write(jcName, 'JKC', jc, k => dic.get(k) ?? 0, [[jkName, totalRow(jk.length), jkjoT], [taiName, totalRow(all.length), taiT]], c.m.org.bank2);
      for (const s of sheets) {
        const m = per.get((s.mcode ?? '').trim()) ?? new Map<string, number>();
        write(s.name ?? s.mcode ?? '', 'JKJO', all, k => m.get(k) ?? 0, [[jkName, totalRow(jk.length), jkjoT], [jcName, totalRow(jc.length), jkcT]], c.m.org.bank);
      }
    }
  });
  return ret;
}
