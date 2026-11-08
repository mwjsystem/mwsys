/**
 * 大会リスト（大会への出店の商品リスト Excel）の解析（現行の make_csv.xlsm の置き換え）。DB に触らない。
 * 上の欄（大会名・出荷日・送先・会場・受注先 …）は左の見出しの文字で、商品の表は見出しの行（品番・準備数・在庫数 …）の列名で読む。
 *  - 出荷時: 準備数を 01 朝来倉庫 → 大会倉庫（5xx）へ移動
 *  - 売上時: 売上数（準備数 − 在庫数）を受注伝票（販売価格・内税）に、在庫数を大会倉庫 → 01 へ戻す
 */

export interface TaikaiItem {
  /** Excel の行（確認用） */
  row: number;
  gcode: string;
  name: string;
  /** 準備数・在庫数（大会のあと残った数）・売上数（準備数 − 在庫数） */
  prep: number;
  stock: number;
  sales: number;
  /** 販売価格（税込） */
  price: number;
  memo: string;
  /** Excel の金額（手で入れた値など、販売価格 × 売上数と違えば注意を出す） */
  amount: number | null;
  /** 以下は DB で解決する */
  gtext: string;
  found: boolean;
}

export interface Taikai {
  fileName: string;
  sheet: string;
  /** 大会名 */
  name: string;
  /** 大分類（名前・コード）・営業担当（名前・コード） */
  daibunName: string;
  daibunrui: string;
  tantoName: string;
  tcode1: string;
  /** 出荷日・到着日・到着時間（yyyy-mm-dd） */
  shipDay: string | null;
  arriveDay: string | null;
  arriveTime: string;
  /** 送先・会場 */
  zip: string;
  addr: string;
  /** 別納品の枝番（分かれば） */
  eda: number | null;
  venue: string;
  atena: string;
  tel: string;
  /** 受注先（名前・コード）・送り状備考 */
  mname: string;
  mcode: string;
  okuriMemo: string;
  items: TaikaiItem[];
  err: string;
}

const clean = (s: string) => (s ?? '').replace(/[\s　]+/g, '');
const num = (s: string): number => {
  const t = (s ?? '').replace(/[,，\s]/g, '').replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const n = Number(t);
  return t == '' || isNaN(n) ? 0 : n;
};

/** 2026-10-23T00:00:00.000Z・2026/10/23・Excel の日付の数値 → 2026-10-23 */
export function toDay(s: string): string | null {
  const t = (s ?? '').trim();
  const m = t.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) {
    return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** シートが大会リストか（「大会名」と、品番・準備数の見出しがある） */
export function isTaikaiSheet(rows: string[][]): boolean {
  return rows.some(r => clean(r[0] ?? '') == '大会名') && rows.some(r => r.some(c => clean(c ?? '') == '品番') && r.some(c => clean(c ?? '') == '準備数'));
}

/** シート（セルの文字の 2 次元配列。0 始まり）を読む */
export function parseTaikai(rows: string[][], fileName: string, sheet: string): Taikai {
  const head = rows.findIndex(r => r.some(c => clean(c ?? '') == '品番') && r.some(c => clean(c ?? '') == '準備数'));
  const top = rows.slice(0, head < 0 ? 8 : head);
  /** 見出し（label）の右の、見出しと違う最初のセル（結合セルは同じ値が続く）。n 番目（0 始まり）の値 */
  const after = (label: string, n = 0): string => {
    for (const r of top) {
      const j = r.findIndex(c => clean(c ?? '') == label);
      if (j < 0) {
        continue;
      }
      const vals: string[] = [];
      for (let k = j + 1; k < r.length; k++) {
        const v = (r[k] ?? '').trim();
        if (v && clean(v) != label && (vals.length == 0 || v != vals[vals.length - 1])) {
          vals.push(v);
        }
      }
      return vals[n] ?? '';
    }
    return '';
  };
  const t: Taikai = {
    fileName, sheet,
    name: after('大会名'),
    daibunName: after('大分類'), daibunrui: clean(after('大分類', 1)),
    tantoName: after('担当者Cd'), tcode1: clean(after('担当者Cd', 1)),
    shipDay: toDay(after('出荷日')), arriveDay: toDay(after('到着日時')), arriveTime: after('到着日時', 1),
    zip: clean(after('送先')).replace(/^(\d{3})-?(\d{4})$/, '$1-$2'), addr: after('送先', 1),
    eda: null, venue: after('会場'), atena: after('宛名'), tel: after('TEL'),
    mname: after('受注先'), mcode: clean(after('受注先', 1)), okuriMemo: after('送り状備考'),
    items: [], err: ''
  };
  // 別納品の枝番（「←別納品枝番」の左のセル。分かれば）
  for (const r of top) {
    const j = r.findIndex(c => clean(c ?? '').includes('別納品枝番'));
    if (j > 0) {
      const v = num(r[j - 1] ?? '');
      t.eda = v > 0 && Number.isInteger(v) ? v : null;
    }
  }
  // 大分類・担当者のコードは見出しのすぐ右の名前の、さらに右（VLOOKUP の結果）。数字でなければ空にする
  if (!/^\d+$/.test(t.daibunrui)) {
    t.daibunrui = '';
  }
  if (!/^\d+$/.test(t.tcode1)) {
    t.tcode1 = '';
  }
  if (!/^[0-9A-Za-z]+$/.test(t.mcode)) {
    t.mcode = '';
  }
  if (head < 0) {
    t.err = '商品の表（品番・準備数の見出し）がありません';
    return t;
  }

  const h = rows[head].map(c => clean(c ?? ''));
  const col = (name: string) => h.indexOf(name);
  const cG = col('品番'), cN = col('商品名'), cP = col('準備数'), cS = col('在庫数'), cPrice = col('販売価格'), cM = col('備考'), cA = col('金額');
  const errs: string[] = [];
  for (let r = head + 1; r < rows.length; r++) {
    const row = rows[r];
    const gcode = clean(row[cG] ?? '');
    if (!gcode) {
      continue;
    }
    if (/品番は|白抜き|準備数が/.test(gcode) || !/^[0-9A-Za-z\-_.\/]+$/.test(gcode)) {
      continue; // 表の下の説明の文
    }
    const prep = num(row[cP] ?? '');
    const stockText = (row[cS] ?? '').trim();
    const stock = num(stockText);
    if (prep == 0 && stock == 0) {
      continue; // 準備数が空白または 0 の品番は対象外（現行と同じ）
    }
    const item: TaikaiItem = {
      row: r + 1, gcode, name: cN >= 0 ? (row[cN] ?? '').trim() : '', prep, stock, sales: prep - stock,
      price: cPrice >= 0 ? num(row[cPrice] ?? '') : 0, memo: cM >= 0 ? (row[cM] ?? '').trim() : '', gtext: '', found: false,
      amount: cA >= 0 && /\d/.test(row[cA] ?? '') ? num(row[cA] ?? '') : null
    };
    if (!Number.isInteger(prep) || !Number.isInteger(stock) || prep < 0 || stock < 0) {
      errs.push(item.row + '行目 ' + gcode + '：数量が不正です');
    } else if (item.sales < 0) {
      errs.push(item.row + '行目 ' + gcode + '：在庫数（' + stock + '）が準備数（' + prep + '）より多い');
    }
    t.items.push(item);
  }
  if (t.items.length == 0) {
    errs.push('準備数の入った商品がありません');
  }
  t.err = errs.join('／');
  return t;
}
