/**
 * Amazon（ベンダーセントラル）の発注 CSV（EditLineItems.csv）の解析。DB に触らない。
 * 現行の「amazon受注テキスト変換.xlsm」の置き換え。列は見出しの名前で探す。
 */

/** 出荷倉庫の初期値 */
export const AMZ_DEFAULT_SCODE = '01';

export interface AmzLine {
  jan: string;
  model: string;
  asin: string;
  /** Amazon の商品名 */
  name: string;
  /** 依頼数量 */
  irai: number;
  /** 受領予定の数量（登録・納品書に使う） */
  qty: number;
  /** 仕入価格（税抜） */
  price: number;
  /** 以下は DB で解決する */
  gcode: string;
  gtext: string;
  /** 代理店単価（tanka3）。仕入価格との確認用 */
  tanka3: number | null;
  taxrate: number;
  genka: number;
  /** 出荷倉庫（画面で明細ごとに選ぶ。初期値 01） */
  scode: string;
}

export interface AmzOrder {
  po: string;
  /** センターコード（FSZ1 など） */
  center: string;
  centerName: string;
  /** 着荷ウィンドウ（yyyy-mm-dd） */
  from: string | null;
  to: string | null;
  lines: AmzLine[];
  /** 数量が 0 のため除いた行数 */
  zero: number;
  /** 以下は DB で解決する */
  nadr: number | null;
  nname: string;
  err: string;
  result: string;
  denno: number | null;
}

const COLS = { po: 'PO', center: '配送センター', asin: 'ASIN', jan: '製品コード', model: 'モデル番号', name: '商品名',
  from: 'ウィンドウ開始日', to: 'ウィンドウ終了日', irai: '依頼数量', qty: '受領予定の数量', price: '仕入価格' } as const;

const num = (s: string): number => {
  const n = Number((s ?? '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};

/** 2024/07/05 → 2024-07-05 */
export function toDay(s: string): string | null {
  const m = (s ?? '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : null;
}

/** CSV の行（1 行目は見出し）を PO ごとの受注にする */
export function parseAmazon(rows: string[][]): AmzOrder[] {
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
  const orders: AmzOrder[] = [];
  const byPo = new Map<string, AmzOrder>();
  for (const r of rows.slice(1)) {
    const v = (k: keyof typeof COLS) => (r[idx[k]] ?? '').trim();
    const po = v('po');
    if (!po) {
      continue;
    }
    let o = byPo.get(po);
    if (!o) {
      const cn = v('center');
      o = {
        po, center: cn.split(/\s*-\s*/)[0].trim(), centerName: cn, from: toDay(v('from')), to: toDay(v('to')),
        lines: [], zero: 0, nadr: null, nname: '', err: '', result: '', denno: null
      };
      byPo.set(po, o);
      orders.push(o);
    }
    const qty = num(v('qty'));
    if (qty <= 0) {
      o.zero++;
      continue;
    }
    o.lines.push({
      jan: v('jan'), model: v('model'), asin: v('asin'), name: v('name'), irai: num(v('irai')), qty, price: num(v('price')),
      gcode: '', gtext: '', tanka3: null, taxrate: 10, genka: 0, scode: AMZ_DEFAULT_SCODE
    });
  }
  return orders;
}

/** 外税の明細金額（画面の受注伝票と同じく、消費税は 単価×税率 を四捨五入して数量を掛ける） */
export function lineMoney(price: number, qty: number, taxrate: number): { money: number; tax: number } {
  return { money: price * qty, tax: Math.round(price * taxrate / 100) * qty };
}
