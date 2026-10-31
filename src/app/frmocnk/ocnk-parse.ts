/**
 * おちゃのこの受注 CSV を、受注ヘッダ・受注明細の形にする（現行 BTC-MWWEB.xlsm の機能１。modJyuchu と同じ手順）。
 * Angular に依存しない。列番号はマクロと同じ 1 始まり。
 */

/** 発送方法の変換（mswebhaiso） */
export interface OcnkHaiso { hname: string; daibunrui: string | null; bumon: string | null; tanto: string | null; mtax: string | null; bkcode: string | null }
/** 道場会員の変換（mswebmember） */
export interface OcnkDojo { webid: string; mcode: string | null; tcode: string | null; kake: boolean; etanto: string | null }

export interface OcnkConf {
  haiso: OcnkHaiso[];
  /** 支払方法の名称 → 入金予定コード */
  pay: Record<string, string>;
  /** お届け時間帯の名称 → 時間コード */
  time: Record<string, string>;
  dojo: Record<string, OcnkDojo>;
  /** 取り込む担当者（'' はすべて） */
  tanto: string;
  /** 一般（未会員）の受注も取り込む */
  ippan: boolean;
  /** 全角 → 半角（VBA の StrConv vbNarrow） */
  narrow: (s: string) => string;
}

export interface OcnkLine { line: number; gcode: string; gtext: string; suu: number; tanka: number; money: number; mtax: string; memo: string }

export interface OcnkOrder {
  cusden: string; kbn: string; webid: string; mcode: string; kake: boolean;
  sei: string; kana: string; company: string; busho: string; mail: string; zip: string; pref: string; addr: string; tel: string;
  nkbn: string; nname: string; ncompany: string; nzip: string; npref: string; naddr: string; ntel: string;
  day: string | null; hday: string | null; htime: string;
  daibunrui: string; bumon: string; tanto: string; etanto: string; pay: string; nyukin: string; bcode: string; bkcode: string;
  dmemo: string; nmemo: string; omemo: string;
  gtotal: number; souryou: number; tesuu: number; nebiki: number; total: number;
  lines: OcnkLine[];
  /** 読み込み時のエラー */
  err: string;
  /** 登録の結果 */
  result: string;
  denno: number | null;
}

export interface OcnkParsed { orders: OcnkOrder[]; notFound: string[] }

/** CSV を行と列に分ける（引用符の中の改行・カンマに対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c == '"') {
        if (text[i + 1] == '"') {
          cell += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cell += c;
      }
    } else if (c == '"') {
      q = true;
    } else if (c == ',') {
      row.push(cell);
      cell = '';
    } else if (c == '\n' || c == '\r') {
      if (c == '\r' && text[i + 1] == '\n') {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell != '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const normLf = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
/** VBA の Trim$（半角スペースのみ） */
const trim = (s: string): string => s.replace(/^ +| +$/g, '');
/** Excel の CLEAN（制御文字を除く） */
const clean = (s: string): string => s.replace(/[\x00-\x1f]/g, '');
const num = (s: string): number => {
  const n = Number((s ?? '').replace(/,/g, '').trim());
  return (s ?? '').trim() == '' || isNaN(n) ? 0 : n;
};
/** VBA の Val（先頭の数字だけ読む） */
const val = (s: string): number => {
  const n = parseFloat((s ?? '').replace(/^\s+/, ''));
  return isNaN(n) ? 0 : n;
};
const cutParen = (s: string): string => s.includes('(') ? trim(s.slice(0, s.indexOf('('))) : s;
const jisu = (s: string): number => s.replace(/[ 　]/g, '').length;

/** オーダーメイド欄の「(+○○円)」の合計 */
export function minusGaku(memo: string): number {
  if (!memo) {
    return 0;
  }
  const arr = memo.split('(+').join('｜').split('｜');
  let ret = 0;
  for (let i = 1; i < arr.length; i++) {
    const p = arr[i].indexOf('円');
    if (p > 0) {
      ret += val(arr[i].slice(0, p).replace(/,/g, ''));
    }
  }
  return ret;
}

/** 日付の文字列を 'YYYY-MM-DD' と 'yyyy/mm/dd hh:nn:ss' にする。日付でなければ null */
function parseDay(s: string): { day: string; stamp: string } | null {
  const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(s ?? '');
  if (!m) {
    return null;
  }
  const p = (v: string | undefined) => ('0' + (v ?? '0')).slice(-2);
  return {
    day: m[1] + '-' + p(m[2]) + '-' + p(m[3]),
    stamp: m[1] + '/' + p(m[2]) + '/' + p(m[3]) + ' ' + p(m[4]) + ':' + p(m[5]) + ':' + p(m[6])
  };
}

const NAME_TAGS: [string, number, string][] = [
  ['[ネーム刺繍（2.5cmまで）]', 275, 'S'], ['[ネーム刺繍・織マーク側（2.5cmまで）]', 275, 'S'],
  ['[ネーム刺繍・織マークの反対側（2.5cmまで）]', 275, 'S'], ['[ネーム刺繍・サイズタグ側（2.5cmまで）]', 275, 'S'],
  ['[ネーム刺繍・サイズタグなし側（2.5cmまで）]', 275, 'S'],
  ['[ネーム刺繍（3cm）]', 330, '3'], ['[ネーム刺繍・織マーク側（3cm）]', 330, '3'], ['[ネーム刺繍・織マークの反対側（3cm）]', 330, '3'],
  ['[ネーム刺繍・サイズタグ側（3cm）]', 330, '3'], ['[ネーム刺繍・サイズタグなし側（3cm）]', 330, '3'],
  ['[ネーム刺繍（上衣）]', 275, 'U'], ['[ネーム刺繍（下衣）]', 275, 'L']
];
const MALL_TAGS: [string, number, string][] = [
  ['[モール（半周）]', 385, 'モール(半周)'], ['[モール(半周)]', 385, 'モール(半周)'], ['[モール(段級位線)(半周)]', 385, 'モール(半周)'],
  ['[モール(一周)]', 770, 'モール(一周)'], ['[モール(段級位線)(一周)]', 770, 'モール(一周)']
];

export function parseOrders(rows: string[][], c: OcnkConf): OcnkParsed {
  const orders: OcnkOrder[] = [];
  const notFound: string[] = [];
  const shorten = (s: string) => c.narrow(trim(s));

  const webAc = (hname: string, gr: string): OcnkHaiso => {
    const key = gr == 'NAS会員' ? 'NAS会員' : hname == '' ? '基本送料' : hname;
    const h = c.haiso.find(e => e.hname == key);
    if (!h) {
      throw new Error('発送方法の変換表に「' + key + '」がありません');
    }
    return h;
  };
  const lk = (tbl: Record<string, string>, key: string, name: string): string => {
    const v = tbl[key];
    if (v == null) {
      throw new Error(name + 'の変換表に「' + key + '」がありません');
    }
    return v;
  };

  /** 受注ヘッダ（Write_Head） */
  const makeHead = (d: (i: number) => string, kbn: string, ha: string, gr: string, dj: OcnkDojo | undefined): OcnkOrder => {
    const nsame = d(27) == '発送先は注文者と同じ';
    const dt = parseDay(d(12));
    const hd = parseDay(d(37));
    const haiso = kbn == '道場' ? null : webAc(ha, gr);
    let dmemo = dt ? dt.stamp : d(12);
    if (d(17) != '店舗が送り主') {
      dmemo += ' 依頼主変更あり(詳細はweb受注を確認)';
    }
    if (kbn == 'NAS会員') {
      dmemo += ' NAS会員';
    }
    return {
      cusden: d(1), kbn, webid: d(52), mcode: dj?.mcode ?? '', kake: dj?.kake ?? false,
      sei: trim(d(4)) || trim(d(2)), kana: d(5), company: d(2), busho: d(3), mail: d(11),
      zip: d(6), pref: d(7), addr: normLf(d(8)), tel: d(9),
      nkbn: nsame ? '1' : '3',
      nname: nsame ? '' : trim(d(29) + ' ' + d(30)), ncompany: nsame ? '' : d(28), nzip: nsame ? '' : d(32),
      npref: nsame ? '' : d(33), naddr: nsame ? '' : normLf(d(34)), ntel: nsame ? '' : d(35),
      day: dt?.day ?? null, hday: hd?.day ?? null,
      htime: d(38) == '' ? '0' : lk(c.time, d(38), 'お届け時間'),
      daibunrui: haiso?.daibunrui ?? '', bumon: haiso?.bumon ?? '', tanto: dj?.tcode ?? haiso?.tanto ?? '', etanto: dj?.etanto ?? '',
      pay: d(16), nyukin: dj?.kake ? '1' : lk(c.pay, d(16), '支払方法'),
      bcode: '01', bkcode: haiso?.bkcode ?? '01',
      dmemo, nmemo: '', omemo: normLf(d(44)).replace(/\n/g, ''),
      gtotal: num(d(13)), souryou: num(d(14)), tesuu: num(d(49)), nebiki: num(d(45)) + num(d(47)), total: num(d(15)),
      lines: [], err: '', result: '', denno: null
    };
  };

  const addLine = (o: OcnkOrder, gcode: string, tanka: number, suu: number, mtax: string, memo: string, gtext = '') => {
    o.lines.push({ line: o.lines.length + 1, gcode, gtext, suu, tanka, money: tanka * suu, mtax, memo });
  };

  /** 「[刺繍位置がＡの場合　書体]」形式（位置Ａ～Ｅ別）の刺繍（Add_Sishu_Lines） */
  const addSishu = (o: OcnkOrder, ordrAll: string, suu0: number, tax: string) => {
    const pos: { c: string; font: string; iro: string }[] = [];
    const moji: { s: string; size: string; idx: number }[] = [];
    for (const raw of normLf(ordrAll).split('\n')) {
      const ordr = trim(clean(raw));
      const p = ordr.indexOf(']');
      if (ordr.startsWith('[刺繍位置が') && ordr.indexOf('の場合') == 7 && p >= 0) {
        const s = trim(ordr.slice(p + 1));
        if (s != '') {
          const ch = ordr[6];
          let idx = pos.findIndex(e => e.c == ch);
          if (idx < 0 && pos.length < 10) {
            pos.push({ c: ch, font: '', iro: '' });
            idx = pos.length - 1;
          }
          if (idx >= 0) {
            const lbl = ordr.slice(10, p);
            if (lbl.includes('書体')) {
              pos[idx].font = s;
            } else if (lbl.includes('文字サイズ') && moji.length < 20) {
              moji.push({ s, size: trim(lbl.slice(lbl.indexOf('文字サイズ') + 5)), idx });
            } else if (lbl.includes('糸色')) { // 「刺?糸色」と文字化けした項目があるため糸色で判定
              pos[idx].iro = s;
            }
          }
        }
      }
    }
    for (const m of moji) {
      let s = m.s;
      let gak = 0;
      const p = s.lastIndexOf('(+');
      if (p >= 0) {
        gak = val(s.slice(p + 2).replace(/,/g, ''));
        s = trim(s.slice(0, p));
      }
      const n = jisu(s);
      if (n > 0) {
        const po = pos[m.idx];
        let memo = c.narrow(po.c) + ' ' + s;
        if (po.font != '') {
          memo += ' ' + po.font;
        }
        memo += ' ' + c.narrow(m.size);
        if (po.iro != '') {
          memo += ' ' + po.iro;
        }
        if (gak % n == 0) {
          addLine(o, 'Z05', gak / n, suu0 * n, tax, memo); // 1文字あたりの単価×文字数
        } else {
          addLine(o, 'Z05', gak, suu0, tax, memo);         // 割り切れない場合は一式
        }
      }
    }
  };

  /** CSV 1 行分の明細（商品＋刺繍・モール等の加工）（Add_Item_Lines） */
  const addItems = (o: OcnkOrder, d: (i: number) => string, ha: string, gr: string) => {
    const tax = webAc(ha, gr).mtax ?? '';
    const suu0 = num(d(42));
    const code = d(40);
    const ordrAll = d(48);
    const gtext = d(39) + (d(43) != '' ? ' ' + d(43) : '');
    const lines = normLf(ordrAll).split('\n');

    // 刺繍内容補足の「(+○○円)」は単価に含まれていないため、単価から引かずに刺繍代として計上する
    let hosoku = 0;
    let strHosoku = '';
    for (const l of lines) {
      const ordr = trim(clean(l));
      if (ordr.includes('[刺繍内容補足]')) {
        hosoku += minusGaku(ordr);
      }
    }
    if (hosoku > 0) {
      strHosoku = ['[胸刺繍] あり', '[肩・袖刺繍] あり', '[襟・背中刺繍] あり'].find(e => ordrAll.includes(e)) ?? '';
    }
    const plus = (tag: string) => strHosoku == tag ? hosoku : 0;

    // 商品（型番に @ があれば入数で単価・数量を換算）
    const sep = code.includes('@') ? '@' : code.includes('＠') ? '＠' : '';
    if (sep != '') {
      const arr = code.split(sep);
      addLine(o, arr[0], num(d(41)) / val(arr[1]), val(arr[1]) * suu0, tax, '', gtext);
    } else {
      addLine(o, code, num(d(41)) - (minusGaku(ordrAll) - hosoku), suu0, tax, '', gtext);
    }

    // オーダーメイド欄を下の行から解析
    let strSub = '';
    let strKsub = '';
    let strMsub = '';
    let strSize = '';
    for (let j = lines.length - 1; j >= 0; j--) {
      const ordr = trim(clean(lines[j]));
      const has = (tag: string) => ordr.includes(tag) && !ordr.endsWith(']');
      const rest = (tag: string) => trim(ordr.split(tag).join(''));

      if (ordr.includes('[胸刺繍] あり')) {
        const gak = minusGaku(ordr) + plus('[胸刺繍] あり');
        if (gak > 0) {
          addLine(o, 'Z05', gak, suu0, tax, '胸刺繍');
        } else {
          addLine(o, 'Z06', 0, suu0, tax, '胸刺繍');
        }
      }
      if (ordr.includes('[肩・袖刺繍] あり')) {
        addLine(o, 'Z05', minusGaku(ordr) + plus('[肩・袖刺繍] あり'), suu0, tax, '肩・袖刺繍');
      }
      if (ordr.includes('[襟・背中刺繍] あり')) {
        addLine(o, 'Z05', minusGaku(ordr) + plus('[襟・背中刺繍] あり'), suu0, tax, '襟・背中刺繍');
      }
      if (has('[オリマーク付替え]')) {
        const s = ordr.split('着用者から見て、').join('').split('[オリマーク付替え]').join('');
        addLine(o, 'Z14', 110, suu0 * s.split('、').length, tax, shorten(s));
      }
      if (has('[個人ネーム刺繍]')) {
        addLine(o, 'Z05', 0, 0, tax, shorten(ordr.split('[個人ネーム刺繍]').join('')));
      }
      if (has('[文字サイズ（2.5cmまでの場合）]')) {
        strSize = cutParen(rest('[文字サイズ（2.5cmまでの場合）]'));
      }
      if (has('[ネーム糸色]')) {
        strSub += rest('[ネーム糸色]');
      }
      if (has('[書体]')) {
        strSub += rest('[書体]');
      }
      if (has('[刺繍位置]')) {
        strSub += rest('[刺繍位置]');
      }
      if (has('[下衣刺繍位置]')) {
        strKsub = rest('[下衣刺繍位置]');
      }
      if (has('[モール糸色]')) {
        strMsub = rest('[モール糸色]');
      }
      for (const [tag, price, kind] of NAME_TAGS) {
        if (has(tag)) {
          const s = cutParen(ordr.split(tag).join(''));
          const suf = kind == 'S' ? '(' + strSize + strSub : kind == '3' ? '(3cm' + strSub : kind == 'U' ? '(上衣' + strSub : '(下衣' + strKsub + strSub;
          addLine(o, 'Z05', price, suu0 * jisu(s), tax, shorten(s + suf));
        }
      }
      for (const [tag, price, label] of MALL_TAGS) {
        if (has(tag)) {
          const s = cutParen(ordr.split(tag).join(''));
          addLine(o, 'MALL', price, suu0 * val(s.split('本').join('')), tax, strMsub + label + s);
        }
      }
      if (has('[マーシャルワールド織マーク] 要')) {
        addLine(o, 'Z14', 110, suu0, tax, 'MW織マーク');
      }
    }

    // 刺繍の指定が無いのに刺繍内容補足に金額がある場合は単独で計上
    if (hosoku > 0 && strHosoku == '') {
      addLine(o, 'Z05', hosoku, suu0, tax, '刺繍内容補足');
    }
    addSishu(o, ordrAll, suu0, tax);
  };

  /** 受注の最後に送料・ポイント・クーポン・代引手数料を明細に追加（Finish_Order） */
  const finish = (o: OcnkOrder, ha: string, gr: string, souryou: number, point: number, coupon: number, daibiki: number) => {
    const tax = webAc(ha, gr).mtax ?? '';
    if (souryou > 0) {
      addLine(o, 'Z01', souryou, 1, '1', '', '送料');
    }
    if (point != 0) {
      addLine(o, 'Z10', point, 1, tax, '', 'ポイント値引');
    }
    if (coupon != 0) {
      addLine(o, 'Z03', coupon, 1, tax, 'クーポンご利用分', 'クーポン値引');
    }
    if (daibiki > 0) {
      addLine(o, 'Z02', daibiki, 1, tax, '', '代引手数料');
    }
  };

  let cur: OcnkOrder | null = null;
  let po: string | null = null;
  let ha = '';
  let gr = '';
  let money = [0, 0, 0, 0];
  const safe = (f: () => void) => {
    try {
      f();
    } catch (e) {
      if (cur) {
        cur.err = cur.err || (e as Error).message;
      }
    }
  };
  const close = () => {
    if (cur && !cur.err) {
      const o = cur;
      safe(() => finish(o, ha, gr, money[0], money[1], money[2], money[3]));
    }
  };
  for (const row of rows.slice(1)) {
    const d = (i: number) => row[i - 1] ?? '';
    if (d(1) == '') {
      continue;
    }
    if (d(1) != po) {
      close();
      cur = null;
      po = d(1);
      ha = d(50);
      gr = d(51);
      money = [num(d(14)), num(d(45)), num(d(47)), num(d(49))];
      let include: boolean;
      let kbn: string;
      let dj: OcnkDojo | undefined;
      if (gr == '' || gr == '未会員') {
        kbn = '一般';
        include = c.ippan;
      } else if (gr == 'NAS会員') {
        kbn = 'NAS会員';
        include = c.tanto == '' || c.tanto == '3124';
      } else {
        kbn = '道場';
        dj = c.dojo[d(52)];
        if (dj) {
          include = c.tanto == '' || (dj.tcode ?? '') == c.tanto;
        } else {
          include = false;
          notFound.push('注文番号 ' + d(1) + '（会員ID ' + d(52) + '）');
        }
      }
      if (include) {
        try {
          cur = makeHead(d, kbn, ha, gr, dj);
        } catch (e) {
          // ヘッダを作れない注文も、一覧にエラーとして出す
          cur = { ...makeBlank(d(1), kbn, d(52)), err: (e as Error).message };
        }
        orders.push(cur);
      }
    }
    if (cur && !cur.err) {
      const o = cur;
      safe(() => addItems(o, d, ha, gr));
    }
  }
  close();
  return { orders, notFound };
}

function makeBlank(cusden: string, kbn: string, webid: string): OcnkOrder {
  return {
    cusden, kbn, webid, mcode: '', kake: false, sei: '', kana: '', company: '', busho: '', mail: '', zip: '', pref: '', addr: '', tel: '',
    nkbn: '1', nname: '', ncompany: '', nzip: '', npref: '', naddr: '', ntel: '', day: null, hday: null, htime: '0',
    daibunrui: '', bumon: '', tanto: '', etanto: '', pay: '', nyukin: '', bcode: '01', bkcode: '01', dmemo: '', nmemo: '', omemo: '',
    gtotal: 0, souryou: 0, tesuu: 0, nebiki: 0, total: 0, lines: [], err: '', result: '', denno: null
  };
}

/** 税込額に含まれる消費税（10/110、端数切り上げ。マイナスの金額は絶対値で計算して符号を戻す） */
export function taxOf(zeikomi: number): number {
  const n = Math.abs(Math.round(zeikomi)) * 10;
  return Math.sign(zeikomi) * Math.ceil(n / 110);
}

/** 税抜額（税込 - 消費税） */
export function exTax(zeikomi: number): number {
  return Math.round(zeikomi) - taxOf(zeikomi);
}
