/**
 * I&T（株式会社アイ・アンド・ティー）の「新規注文データ」CSV の解析。DB に触らない。
 * 現行の「I&T受注テキスト変換.xlsm」の置き換え。列は見出しの名前で探す。1 行 = 注文の明細 1 行。
 */

/** 出荷倉庫の初期値 */
export const IT_DEFAULT_SCODE = '01';

export interface ItLine {
  jan: string;
  /** 貴社品番（JAN で見つからないときに商品コードとして探す） */
  hinban: string;
  /** I&T の品名 */
  name: string;
  /** 総数（個数 × 入数） */
  qty: number;
  /** 発注単価（I&T の単価。確認用。登録は代理店単価） */
  price: number;
  /** 以下は DB で解決する */
  gcode: string;
  gtext: string;
  /** 代理店単価（tanka3）。登録する単価 */
  tanka3: number | null;
  taxrate: number;
  genka: number;
  /** 出荷倉庫（画面で明細ごとに選ぶ。初期値 01） */
  scode: string;
}

export interface ItOrder {
  /** 注文No. */
  no: string;
  /** 発注日（yyyy-mm-dd） */
  hday: string | null;
  /** 備考（仕入先/I＆Tのみ）。出荷期限など */
  bikou: string;
  /** 納入先 */
  zip: string;
  pref: string;
  addr: string;
  company: string;
  busho: string;
  name: string;
  tel: string;
  lines: ItLine[];
  /** 以下は DB で解決する */
  err: string;
  result: string;
  denno: number | null;
}

const COLS = {
  no: '注文No.', hday: '発注日', jan: 'JAN', name: '品名', qty: '総数', price: '発注単価', bikou: '備考（仕入先/I＆Tのみ）',
  zip: '納入先 〒', pref: '納入先 県', addr: '納入先 住所', company: '納入先 法人名', busho: '納入先 部署', nname: '納入先 名称', tel: '納入先 TEL'
} as const;
/** 貴社品番の列（古いファイルでは「特記事項(ﾒｰｶｰ品番)」で、品番ではない） */
const COL_HINBAN = '貴社品番';

const num = (s: string): number => {
  const n = Number((s ?? '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};

/** 2026/04/18 → 2026-04-18 */
function toDay(s: string): string | null {
  const m = (s ?? '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : null;
}

/** 〒 を 123-4567 にそろえる */
function fmtZip(s: string): string {
  const d = (s ?? '').replace(/[^0-9]/g, '');
  return d.length == 7 ? d.slice(0, 3) + '-' + d.slice(3) : (s ?? '').trim();
}

/** CSV の行（1 行目は見出し）を注文No. ごとの受注にする。空の行は飛ばす */
export function parseIt(rows: string[][]): ItOrder[] {
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
  const iHinban = head.indexOf(COL_HINBAN);
  const orders: ItOrder[] = [];
  const byNo = new Map<string, ItOrder>();
  for (const r of rows.slice(1)) {
    const v = (k: keyof typeof COLS) => (r[idx[k]] ?? '').trim();
    const no = v('no');
    if (!no) {
      continue;
    }
    let o = byNo.get(no);
    if (!o) {
      o = {
        no, hday: toDay(v('hday')), bikou: v('bikou').replace(/[\s　]+$/, ''),
        zip: fmtZip(v('zip')), pref: v('pref'), addr: v('addr'), company: v('company'), busho: v('busho'), name: v('nname'), tel: v('tel'),
        lines: [], err: '', result: '', denno: null
      };
      byNo.set(no, o);
      orders.push(o);
    }
    o.lines.push({
      jan: v('jan'), hinban: iHinban >= 0 ? (r[iHinban] ?? '').trim() : '', name: v('name'), qty: num(v('qty')), price: num(v('price')),
      gcode: '', gtext: '', tanka3: null, taxrate: 10, genka: 0, scode: IT_DEFAULT_SCODE
    });
  }
  for (const o of orders) {
    if (o.lines.some(l => l.qty <= 0)) {
      o.err = '総数が 0 の明細があります';
    }
  }
  return orders;
}
