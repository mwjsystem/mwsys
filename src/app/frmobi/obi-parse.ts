/**
 * 帯（色帯）の注文用紙 Excel の解析（現行の「色帯受注テキスト変換.xlsm」など道場ごとのマクロの置き換え・第 1 段階）。DB に触らない。
 * 用紙はセルの位置が用紙ごとに違うため、位置を決め打ちせず見出しの文字で読む:
 *  - 「0号 1号 … 8号」が並ぶ行を表の見出しとし、その下を「合計」の行まで読む（行 = 色、列 = 号）
 *  - 色は行名の先頭の文字（橙・青・黄 …）、行名に「銀」「モール」があれば銀線入り
 *  - 帯の種類（CB19・CB-K など）は用紙の見出しの文字で判定する（画面で変えられる）
 *  - お客様コードは「お客様コード」の右のセル
 */

import { cellText } from './../frmtkd/tkd-parse';

/** exceljs のシートに必要なところだけ */
export interface SheetLike {
  rowCount: number;
  columnCount: number;
  getRow(r: number): { getCell(c: number): { value: unknown } };
}

/** シートをセルの文字の 2 次元配列にする（0 始まり。結合セルは exceljs が左上の値を返す） */
export function sheetRows(ws: SheetLike, maxRows = 120, maxCols = 40): string[][] {
  const rows: string[][] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, maxRows); r++) {
    const row = ws.getRow(r);
    const v: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, maxCols); c++) {
      v.push(cellText(row.getCell(c).value).trim());
    }
    rows.push(v);
  }
  return rows;
}

/** 出荷倉庫の初期値 */
export const OBI_DEFAULT_SCODE = '01';
/** 銀線（モール）代の商品コード（銀線入りの帯 1 本につき 1） */
export const MALL_GCODE = 'MALL';
/** 銀線（MALL）代の単価の初期値（画面で変えられる） */
export const MALL_DEFAULT_TANKA = 350;

/** 帯の種類。code(号, 色, 銀線) で商品コードを作る */
export interface ObiKind {
  key: string;
  name: string;
  /** 用紙の見出しにこの文字があればこの種類 */
  marks: string[];
  code: (size: string, color: string, sv: boolean) => string;
  /** 銀線入りの明細に入れる明細備考 */
  svMemo: string;
  /** 帯の明細から足す明細（赤帯の刺繍代など） */
  extras?: (lines: ObiLine[]) => ObiLine[];
}

const extra = (gcode: string, label: string, qty: number, fixed: number, memo: string): ObiLine => ({
  gcode, label, qty, memo, fixed, gtext: '', tanka: 0, taxrate: 10, genka: 0, scode: OBI_DEFAULT_SCODE
});

/** 極真の CB-K に無い色（赤・紫・水色・紺など）は CB19 で手配する（現行マクロと同じ） */
const CBK_COLORS = ['OR', 'BU', 'YL', 'GR', 'BR'];

export const OBI_KINDS: ObiKind[] = [
  {
    key: 'CB-K', name: '極真会色帯 CB-K', marks: ['CB-K', 'CB-Ｋ', 'ＣＢ－Ｋ'],
    code: (n, c, sv) => CBK_COLORS.includes(c) ? 'CB-' + n + '-' + c + '-K' + (sv ? 'SV' : '') : 'CB19-' + n + '-' + c,
    svMemo: '',
    // 赤帯（CB19 で手配）は極真会の刺繍代と織マーク代を足す（現行マクロと同じ単価）
    extras: lines => {
      const red = lines.filter(l => /^CB19-\d-RD$/.test(l.gcode)).reduce((s, l) => s + l.qty, 0);
      return red > 0 ? [extra('Z05', '赤帯の極真会刺繍代', red, 600, '(赤帯)極真会刺繍代'), extra('Z14', '赤帯の織マーク代', red, 100, '赤帯分')] : [];
    }
  },
  {
    key: 'CBKK1', name: '極真会館色帯 CBKK1', marks: ['CBKK1', 'ＣＢＫＫ１'],
    code: (n, c, sv) => 'CBKK1' + c + n + (sv ? 'SV' : ''), svMemo: ''
  },
  {
    key: 'CB19-H', name: '色帯 CB19-H', marks: ['CB19-H', 'ＣＢ１９－Ｈ'],
    code: (n, c, sv) => 'CB19-' + n + '-' + c + '-H' + (sv ? 'SV' : ''), svMemo: ''
  },
  {
    key: 'CB19', name: '色帯 CB19', marks: ['CB19', 'ＣＢ１９'],
    code: (n, c) => 'CB19-' + n + '-' + c, svMemo: '銀ﾓｰﾙ'
  }
];

/** 行名の先頭の文字 → 色のコード（現行マクロの対応表を合わせたもの） */
const COLORS: [string, string][] = [
  ['橙', 'OR'], ['オ', 'OR'], ['青', 'BU'], ['黄', 'YL'], ['緑', 'GR'], ['茶', 'BR'], ['紫', 'PU'],
  ['水', 'AQ'], ['紺', 'NV'], ['赤', 'RD'], ['黒', 'BK'], ['白', 'WH']
];

export interface ObiLine {
  gcode: string;
  /** 用紙の行名・号（確認用） */
  label: string;
  qty: number;
  memo: string;
  /** 決まった単価（赤帯の刺繍代など）。無ければ商品マスタの顧客の単価 */
  fixed?: number;
  /** 以下は DB で解決する */
  gtext: string;
  tanka: number;
  taxrate: number;
  genka: number;
  /** 出荷倉庫（画面で明細ごとに選ぶ。初期値 01） */
  scode: string;
}

export interface ObiOrder {
  fileName: string;
  sheet: string;
  /** 用紙のお客様コード（画面で直せる） */
  mcode: string;
  kind: string;
  /** 用紙の見出し（種類の判定に使った文字。確認用） */
  title: string;
  lines: ObiLine[];
  /** 用紙の備考・送り先の記入（伝票備考にする・確認用） */
  bikou: string;
  okurisaki: string;
  /** 用紙の帯の本数の合計・銀線の本数（確認用） */
  belts: number;
  sv: number;
  /** 用紙を読んだときのエラー */
  perr: string;
  /** 以下は DB で解決する */
  mname: string;
  /** perr と DB で解決したときのエラー */
  err: string;
  warn: string;
  result: string;
  denno: number | null;
}

/** 全角英数字を半角に（用紙の数字・英字の表記ゆれ） */
const narrow = (s: string) => s.replace(/[０-９Ａ-Ｚａ-ｚ－]/g, c => c == '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const clean = (s: string) => narrow((s ?? '').replace(/[\s　]+/g, ''));

/** 号の見出し（0号・１号・8号 など）→ 号の数字 */
function sizeOf(s: string): string | null {
  const m = clean(s).match(/^(\d)号$/);
  return m ? m[1] : null;
}

/** 種類を用紙の文字から判定する（具体的なものから順に） */
export function detectKind(texts: string[]): ObiKind | null {
  const all = texts.map(clean).join(' ');
  return OBI_KINDS.find(k => k.marks.some(m => all.includes(clean(m)))) ?? null;
}

const toNum = (s: string): number => {
  const n = Number(clean(s).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * シート（セルの文字の 2 次元配列。rows[r][c]、0 始まり）から注文を読む。
 * 表が見つからなければ null。kindKey を渡せばその種類で、無ければ用紙の見出しで判定する
 */
export function parseObiSheet(rows: string[][], fileName: string, sheet: string, kindKey?: string): ObiOrder | null {
  // 1. 号の見出しの行（号が 3 つ以上並ぶ最初の行）
  const hr = rows.findIndex(r => r.filter(c => sizeOf(c ?? '') != null).length >= 3);
  if (hr < 0) {
    return null;
  }
  const sizes = new Map<number, string>();
  rows[hr].forEach((c, j) => {
    const s = sizeOf(c ?? '');
    if (s != null) {
      sizes.set(j, s);
    }
  });
  const firstCol = Math.min(...sizes.keys());
  const labelOf = (row: string[]) => (row[firstCol - 1] || row[0] || '').trim();
  // 見出しの下に色の行が無ければ帯の表ではない（空手着の号の表など）
  const colorRow = (row: string[]) => COLORS.some(([ch]) => clean(labelOf(row)).startsWith(ch));
  if (!rows.slice(hr + 1, hr + 16).some(colorRow)) {
    return null;
  }

  // 2. 見出し（表より上の文字）で種類を判定
  const above = rows.slice(0, hr + 1).flatMap(r => r.filter(c => c));
  const title = above.find(c => OBI_KINDS.some(k => k.marks.some(m => clean(c).includes(clean(m))))) ?? '';
  const kind = OBI_KINDS.find(k => k.key == kindKey) ?? detectKind(above) ?? OBI_KINDS.find(k => k.key == 'CB19')!;

  // 3. お客様コード（「お客様コード」の右の最初の空でないセル。同じ文字が続く結合セルは飛ばす）
  let mcode = '';
  for (const r of rows.slice(0, hr)) {
    const j = r.findIndex(c => clean(c ?? '').includes('お客様コード'));
    if (j >= 0) {
      const v = r.slice(j + 1).find(c => c && !clean(c).includes('お客様コード'));
      mcode = v ? clean(v).replace(/[^0-9A-Za-z]/g, '') : '';
      break;
    }
  }

  // 4. 表（合計の行まで）
  const order: ObiOrder = {
    fileName, sheet, mcode, kind: kind.key, title: (title ?? '').trim(), lines: [], bikou: '', okurisaki: '', belts: 0, sv: 0,
    perr: '', mname: '', err: '', warn: '', result: '', denno: null
  };
  const unknown: string[] = [];
  let mall = 0;
  let r = hr + 1;
  for (; r < rows.length; r++) {
    const label = labelOf(rows[r]);
    const lab = clean(label);
    // 合計・帯本数・モール数の行、黒帯（金モール）の表で色帯の表は終わり
    if (/合計|本数|モール数|金モール|金線/.test(lab)) {
      break;
    }
    const cells = [...sizes.entries()].map(([j, n]) => ({ n, qty: toNum(rows[r][j] ?? '') })).filter(e => e.qty != 0);
    if (cells.length == 0) {
      continue;
    }
    const color = COLORS.find(([ch]) => lab.startsWith(ch))?.[1];
    if (!color) {
      unknown.push(label || (r + 1) + '行目');
      continue;
    }
    const sv = /銀|ﾓｰﾙ|モール/.test(lab);
    for (const c of cells) {
      if (!Number.isInteger(c.qty) || c.qty < 0) {
        unknown.push(label + ' ' + c.n + '号（数量 ' + c.qty + '）');
        continue;
      }
      const gcode = kind.code(c.n, color, sv);
      order.lines.push({
        gcode, label: label + ' ' + c.n + '号', qty: c.qty, memo: sv ? kind.svMemo : '',
        gtext: '', tanka: 0, taxrate: 10, genka: 0, scode: OBI_DEFAULT_SCODE
      });
      order.belts += c.qty;
      if (sv) {
        order.sv += c.qty;
        // 品番が SV 付きの帯は銀線の代金を含むので、銀線（MALL）代には数えない（二重取りになる）
        if (!gcode.endsWith('SV')) {
          mall += c.qty;
        }
      }
    }
  }
  order.lines.push(...(kind.extras?.(order.lines) ?? []));
  // 銀線（モール）代：品番に SV が付かない銀線入りの帯の本数。単価は画面で変えられる（初期値 350 円）
  if (mall > 0) {
    order.lines.push({
      gcode: MALL_GCODE, label: '銀線（モール）代', qty: mall, memo: '', fixed: MALL_DEFAULT_TANKA,
      gtext: '', tanka: MALL_DEFAULT_TANKA, taxrate: 10, genka: 0, scode: OBI_DEFAULT_SCODE
    });
  }

  // 5. 表より下の備考・上の送り先の記入（確認用。伝票備考にする）
  const bikou: string[] = [];
  for (const row of rows.slice(r + 1)) {
    const j = row.findIndex(c => clean(c ?? '').startsWith('備考'));
    if (j >= 0) {
      const t = row.map(c => (c ?? '').trim()).filter(c => c && !clean(c).startsWith('備考'));
      bikou.push(...new Set(t));
    }
  }
  order.bikou = [...new Set(bikou)].join(' ').slice(0, 200);
  const okuri: string[] = [];
  for (const row of rows.slice(0, hr)) {
    if (clean(row[0] ?? '').startsWith('ご住所')) {
      okuri.push(...row.slice(1).map(c => (c ?? '').trim()).filter(c => c && !c.startsWith('※')));
    }
  }
  order.okurisaki = [...new Set(okuri)].join(' ');

  // 黒帯の注文欄（第 2 段階で取り込む）に数量があれば知らせる
  const rest = rows.slice(r);
  const blackHead = rest.findIndex(row => /黒帯|BBY|金モール/.test(clean(row.join(' '))));
  if (blackHead >= 0) {
    const hasQty = rest.slice(blackHead).some(row => {
      const lab = clean(labelOf(row));
      return /金モール|黒/.test(lab) && [...sizes.keys()].some(j => toNum(row[j] ?? '') > 0 && toNum(row[j] ?? '') < 1000);
    });
    if (hasQty) {
      order.warn = '用紙に黒帯の注文があります。黒帯はまだ取り込めないので、受注伝票に手で追加してください';
    }
  }

  if (unknown.length > 0) {
    order.perr = '色・数量を読めない行があります：' + unknown.join('、');
  } else if (order.lines.length == 0) {
    order.perr = '注文の数量がありません';
  }
  order.err = order.perr;
  return order;
}
