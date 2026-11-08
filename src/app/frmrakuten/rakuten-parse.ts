/**
 * 楽天（RMS）の受注 CSV の解析。DB に触らない。
 * 現行の通販Pro の取込設定「175 楽天SSデータ（2019/2/1～）」の置き換え。
 * 1 行が商品 1 つで、注文番号が同じ行を 1 受注にする。列は見出しの名前で探す。
 */

export interface RakutenLine {
  /** 商品コード（システム連携用SKU番号。送料は Z01、代引手数料は Z02、ポイント利用は Z10） */
  gcode: string;
  /** 楽天の商品名（確認用。登録する品名は商品マスタの品名） */
  name: string;
  suu: number;
  /** 単価（税込別が 1 なら税込） */
  tanka: number;
  /** 税区分（0：外税 1：内税。CSV の税込別） */
  mtax: string;
  /** 項目・選択肢（確認用） */
  option: string;
  /** 倉庫（画面で選ぶ） */
  scode: string;
  /** 以下は DB で解決する */
  gtext: string;
  /** 商品区分（0：商品 1：送料 2：手数料 3：値引） */
  gkbn: string;
  taxrate: number;
  genka: number;
}

export interface RakutenOrder {
  /** 注文番号（客先伝票番号にする） */
  cusden: string;
  /** 受注日（yyyy-mm-dd） */
  day: string | null;
  time: string;
  pay: string;
  /** 入金予定コード */
  pcode: string;
  daibiki: boolean;
  /** 注文者 */
  sei: string; kana: string; zip: string; pref: string; city: string; addr: string; tel: string;
  /** 送付先 */
  nsei: string; nkana: string; nzip: string; npref: string; ncity: string; naddr: string; ntel: string;
  /** 置き配（変換後。納品書備考・送り状備考） */
  okihai: string;
  /** CSV の請求金額（明細の合計との確認用） */
  seikyu: number;
  lines: RakutenLine[];
  /** 以下は DB で解決する */
  mcode: string;
  /** 既存の顧客か（電話番号で見つかった） */
  found: boolean;
  err: string;
  result: string;
  denno: number | null;
}

/** 支払方法 → 入金予定コード（通販Pro の変換表。セブンイレブン（前払）は銀行振込と同じ 5） */
export const RAKUTEN_PAY: Record<string, string> = {
  'クレジットカード': '7', '楽天バンク決済': '5', '銀行振込': '5', '代金引換': '9', '郵便振替': '4', 'セブンイレブン（前払）': '5'
};

/** 置き配場所の変換（通販Pro の変換表。無いものはそのまま） */
const OKIHAI: Record<string, string> = {
  'メーターボックス': '置配指定:メーターボックス', '玄関前': '置配指定:玄関前', '車庫': '置配指定:車庫',
  '宅配ボックス': '置配指定:宅配ボックス', '置き配を利用しない': '置き配を利用しない', '物置': '置配指定:物置'
};

/** 送料・代引手数料・ポイント利用の商品コード */
export const RAKUTEN_SORYO = 'Z01';
export const RAKUTEN_DAIBIKI = 'Z02';
export const RAKUTEN_POINT = 'Z10';

const COLS = {
  cusden: '注文番号', seikyu: '請求金額', soryo: '送料合計', daibiki: '代引料合計', day: '注文日', time: '注文時間',
  zip1: '注文者郵便番号1', zip2: '注文者郵便番号2', pref: '注文者住所都道府県', city: '注文者住所郡市区', addr: '注文者住所それ以降の住所',
  sei: '注文者姓', mei: '注文者名', seik: '注文者姓カナ', meik: '注文者名カナ', tel1: '注文者電話番号1', tel2: '注文者電話番号2', tel3: '注文者電話番号3',
  pay: '支払方法名', point: 'ポイント利用額',
  nzip1: '送付先郵便番号1', nzip2: '送付先郵便番号2', npref: '送付先住所都道府県', ncity: '送付先住所郡市区', naddr: '送付先住所それ以降の住所',
  nsei: '送付先姓', nmei: '送付先名', nseik: '送付先姓カナ', nmeik: '送付先名カナ', ntel1: '送付先電話番号1', ntel2: '送付先電話番号2', ntel3: '送付先電話番号3',
  name: '商品名', gcode: 'システム連携用SKU番号', tanka: '単価', suu: '個数', zei: '税込別', option: '項目・選択肢', okihai: '置き配場所'
} as const;

const num = (s: string): number => {
  const n = Number((s ?? '').replace(/,/g, '').trim());
  return (s ?? '').trim() == '' || isNaN(n) ? 0 : n;
};
const join = (sep: string, ...a: string[]) => a.map(e => (e ?? '').trim()).filter(e => e).join(sep);

/** 文字の変換（全角 → 半角カナ・半角 → 全角）。encoding-japanese を使う画面から渡す */
export interface RakutenConv {
  /** フリガナ（全角カナ → 半角カナ。通販Pro の「あ→ｱ」） */
  kana: (s: string) => string;
  /** 氏名・住所（半角 → 全角。通販Pro の「半→全」） */
  wide: (s: string) => string;
  /** 郵便番号・電話番号（全角 → 半角） */
  narrow: (s: string) => string;
}

/** CSV の行（1 行目は見出し）を注文ごとの受注にする */
export function parseRakuten(rows: string[][], conv: RakutenConv, scode: string): RakutenOrder[] {
  const head = rows[0]?.map(e => e.trim()) ?? [];
  const idx = {} as Record<keyof typeof COLS, number>;
  const missing: string[] = [];
  (Object.keys(COLS) as (keyof typeof COLS)[]).forEach(k => {
    idx[k] = head.indexOf(COLS[k]);
    if (idx[k] < 0) {
      missing.push(COLS[k]);
    }
  });
  if (missing.length > 0) {
    throw new Error('CSV に次の列がありません：' + missing.join('、'));
  }
  const orders: RakutenOrder[] = [];
  const byNo = new Map<string, { o: RakutenOrder; last: string[] }>();
  for (const r of rows.slice(1)) {
    const v = (k: keyof typeof COLS) => (r[idx[k]] ?? '').trim();
    const cusden = v('cusden');
    if (!cusden) {
      continue;
    }
    let e = byNo.get(cusden);
    if (!e) {
      const pay = v('pay');
      const m = v('day').match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      const tel = (a: string, b: string, c: string) => conv.narrow(join('-', a, b, c));
      const zip = (a: string, b: string) => conv.narrow(join('-', a, b));
      const ok = v('okihai');
      const o: RakutenOrder = {
        cusden, day: m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : null, time: v('time'), pay,
        pcode: RAKUTEN_PAY[pay] ?? '', daibiki: pay.includes('代金引換'),
        sei: conv.wide(join('　', v('sei'), v('mei'))), kana: conv.kana(join(' ', v('seik'), v('meik'))),
        zip: zip(v('zip1'), v('zip2')), pref: conv.wide(v('pref')), city: conv.wide(v('city')), addr: conv.wide(v('addr')),
        tel: tel(v('tel1'), v('tel2'), v('tel3')),
        nsei: conv.wide(join('　', v('nsei'), v('nmei'))), nkana: conv.kana(join(' ', v('nseik'), v('nmeik'))),
        nzip: zip(v('nzip1'), v('nzip2')), npref: conv.wide(v('npref')), ncity: conv.wide(v('ncity')), naddr: conv.wide(v('naddr')),
        ntel: tel(v('ntel1'), v('ntel2'), v('ntel3')),
        okihai: ok ? OKIHAI[ok] ?? ok : '', seikyu: num(v('seikyu')), lines: [],
        mcode: '', found: false, err: '', result: '', denno: null
      };
      const errs: string[] = [];
      if (!o.day) {
        errs.push('注文日が読めません（' + v('day') + '）');
      }
      if (!o.pcode) {
        errs.push('支払方法「' + pay + '」の入金予定コードがありません');
      }
      o.err = errs.join('／');
      e = { o, last: r };
      byNo.set(cusden, e);
      orders.push(o);
    }
    e.last = r;
    // 商品（通販Pro の「全部」）
    const gcode = conv.narrow(v('gcode'));
    if (gcode) {
      e.o.lines.push(line(gcode, v('name'), num(v('suu')), num(v('tanka')), v('zei') == '0' || v('zei') == '別' ? '0' : '1', v('option'), scode));
    } else {
      e.o.err = join('／', e.o.err, 'SKU 番号の無い商品があります（' + v('name').slice(0, 30) + '）');
    }
  }
  // 送料・代引手数料・ポイント利用（通販Pro の「最後」。注文の最後の行の値、0 は作らない）
  for (const { o, last } of byNo.values()) {
    const v = (k: keyof typeof COLS) => (last[idx[k]] ?? '').trim();
    const soryo = num(v('soryo'));
    const daibiki = num(v('daibiki'));
    const point = num(v('point'));
    if (soryo != 0) {
      o.lines.push(line(RAKUTEN_SORYO, '送料', 1, soryo, '1', '', scode));
    }
    if (daibiki != 0) {
      o.lines.push(line(RAKUTEN_DAIBIKI, '代引手数料', 1, daibiki, '1', '', scode));
    }
    if (point != 0) {
      o.lines.push(line(RAKUTEN_POINT, 'ポイント利用', 1, -point, '1', '', scode));
    }
  }
  return orders;
}

function line(gcode: string, name: string, suu: number, tanka: number, mtax: string, option: string, scode: string): RakutenLine {
  return { gcode, name, suu, tanka, mtax, option, scode, gtext: '', gkbn: '0', taxrate: 10, genka: 0 };
}

/** 内税の消費税（税込 × 税率 /（100 + 税率）の端数切り上げ。おちゃのこの取込と同じ） */
export function taxIn(zeikomi: number, rate: number): number {
  const n = Math.abs(Math.round(zeikomi)) * rate;
  return Math.sign(zeikomi) * Math.ceil(n / (100 + rate));
}

/** 明細の金額（税抜・税込・消費税） */
export function lineMoney(l: Pick<RakutenLine, 'tanka' | 'suu' | 'mtax' | 'taxrate'>): { money: number; tout: number; tin: number; tax: number } {
  const money = l.tanka * l.suu;
  if (l.mtax == '0') {
    // 外税：受注伝票画面と同じく 単価 × 税率 を四捨五入して数量を掛ける
    const tax = Math.round(l.tanka * l.taxrate / 100) * l.suu;
    return { money, tout: money, tin: money + tax, tax };
  }
  const tax = taxIn(money, l.taxrate);
  return { money, tout: money - tax, tin: money, tax };
}

/** 明細の合計（税込） */
export function orderTotal(o: RakutenOrder): number {
  return o.lines.reduce((s, l) => s + lineMoney(l).tin, 0);
}
