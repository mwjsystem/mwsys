/**
 * 帯の注文用紙 Excel の解析（現行の「色帯受注テキスト変換.xlsm」など道場ごとのマクロの置き換え）。DB に触らない。
 * 用紙はセルの位置が用紙ごとに違うため、位置を決め打ちせず見出しの文字で読む:
 *  - 色帯（第 1 段階）: 「0号 1号 … 8号」が並ぶ行の下を「合計・帯本数」の行まで読む（行 = 色、列 = 号）。
 *    色は行名の先頭の文字（橙・青・黄 …）、行名に「銀」「金」「モール」があれば線入り。種類（CB19・CB-K など）は見出しの文字で判定
 *  - 黒帯（第 2 段階）: 行名が「金モールN本」「なし」の表（行 = 金モールの本数、列 = 号）。品番は見出しの BBY1 / BB
 *  - お客様コードは「お客様コード」「会員コード」「顧客コード」の右のセル
 * 読んだ数量（cells）から明細を作るのは buildObiLines（画面の設定で作り直す）。
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
/** モール（銀線・金線）代の商品コード */
export const MALL_GCODE = 'MALL';
/** 色帯のモール（半周）の単価の初期値（画面で変えられる） */
export const MALL_DEFAULT_TANKA = 350;
/** 黒帯の金モール（一周）の単価の初期値（画面で変えられる） */
export const GOLD_DEFAULT_TANKA = 700;
/** 織マーク代の商品コード・単価の初期値 */
export const ORI_GCODE = 'Z14';
export const ORI_DEFAULT_TANKA = 100;

/** 帯の種類（色帯）。code(号, 色, 線入り) で商品コードを作る */
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

const line = (gcode: string, label: string, qty: number, memo: string, fixed?: number): ObiLine => ({
  gcode, label, qty, memo, fixed, gtext: '', tanka: fixed ?? 0, taxrate: 10, genka: 0, scode: OBI_DEFAULT_SCODE
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
      return red > 0 ? [line('Z05', '赤帯の極真会刺繍代', red, '(赤帯)極真会刺繍代', 600), line('Z14', '赤帯の織マーク代', red, '赤帯分', 100)] : [];
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

/** 黒帯の品番（見出しの文字で判定。無ければ BBY1） */
export const BLACK_KINDS = ['BBY1', 'BBY2', 'BB'];

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
  /** 決まった単価（モール代・赤帯の刺繍代など）。無ければ商品マスタの顧客の単価 */
  fixed?: number;
  /** 以下は DB で解決する */
  gtext: string;
  tanka: number;
  taxrate: number;
  genka: number;
  /** 出荷倉庫（画面で明細ごとに選ぶ。初期値 01） */
  scode: string;
}

/** 色帯の表のマス（数量のあるもの） */
export interface ColorCell { label: string; size: string; color: string; line: '' | 'silver' | 'gold'; qty: number }
/** 黒帯の表のマス（gold は金モールの本数） */
export interface BlackCell { label: string; size: string; gold: number; qty: number }

export interface ObiOrder {
  fileName: string;
  sheet: string;
  /** 用紙のお客様コード（画面で直せる） */
  mcode: string;
  /** 色帯の種類（CB19 など） */
  kind: string;
  /** 黒帯の品番（BBY1 など） */
  black: string;
  /** 用紙の見出し（種類の判定に使った文字。確認用） */
  title: string;
  /** 用紙の数量 */
  colorCells: ColorCell[];
  blackCells: BlackCell[];
  /** 用紙の黒帯の金モール数の行の合計（あれば。明細の金モールの本数と比べる） */
  goldOnForm: number | null;
  /** 画面の設定（明細を作り直すときに使う） */
  mallTanka: number;
  goldTanka: number;
  /** 黒帯の単価に含む金モールの本数（それを超えた分を MALL にする） */
  goldIncl: number;
  /** 織マーク代（Z14）を帯の本数分つける */
  ori: boolean;
  oriTanka: number;
  oriMemo: string;
  lines: ObiLine[];
  /** 用紙の備考・送り先の記入（伝票備考にする・確認用） */
  bikou: string;
  okurisaki: string;
  /** 用紙の帯の本数の合計・線入りの本数（確認用） */
  belts: number;
  sv: number;
  blackBelts: number;
  /** 用紙を読んだときのエラー・注意 */
  perr: string;
  pwarn: string;
  /** 以下は DB で解決する */
  mname: string;
  /** perr と DB で解決したときのエラー */
  err: string;
  /** pwarn と明細を作ったときの注意 */
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

/** 黒帯の表の行名 → 金モールの本数（「金モール3本」「金ﾓｰﾙ3本」→ 3、「なし」→ 0）。黒帯の行でなければ null */
function goldOf(lab: string): number | null {
  if (lab == 'なし' || lab.startsWith('モールなし') || lab.startsWith('金モールなし')) {
    return 0;
  }
  const m = lab.match(/^金(?:モール|ﾓｰﾙ|線)(\d+)本/);
  return m ? Number(m[1]) : null;
}

/** 号の見出しの行（号が 3 つ以上並ぶ行）の、号の列 */
function sizeCols(row: string[]): Map<number, string> | null {
  const sizes = new Map<number, string>();
  row.forEach((c, j) => {
    const s = sizeOf(c ?? '');
    if (s != null) {
      sizes.set(j, s);
    }
  });
  return sizes.size >= 3 ? sizes : null;
}

/**
 * シート（セルの文字の 2 次元配列。rows[r][c]、0 始まり）から注文を読む。
 * 色帯・黒帯の表がどちらも無ければ null。kindKey を渡せばその種類で、無ければ用紙の見出しで判定する
 */
export function parseObiSheet(rows: string[][], fileName: string, sheet: string, kindKey?: string): ObiOrder | null {
  const order: ObiOrder = {
    fileName, sheet, mcode: '', kind: '', black: '', title: '', colorCells: [], blackCells: [], goldOnForm: null,
    mallTanka: MALL_DEFAULT_TANKA, goldTanka: GOLD_DEFAULT_TANKA, goldIncl: 0, ori: false, oriTanka: ORI_DEFAULT_TANKA, oriMemo: '',
    lines: [], bikou: '', okurisaki: '', belts: 0, sv: 0, blackBelts: 0,
    perr: '', pwarn: '', mname: '', err: '', warn: '', result: '', denno: null
  };
  const unknown: string[] = [];
  let firstHead = -1;
  let lastRow = -1;

  for (let hr = 0; hr < rows.length; hr++) {
    const sizes = sizeCols(rows[hr]);
    if (!sizes) {
      continue;
    }
    const firstCol = Math.min(...sizes.keys());
    const labelOf = (row: string[]) => (row[firstCol - 1] || row[0] || '').trim();
    // 合計の行・「黒帯合計」などの見出しは色の行と間違えないよう除く
    const next = rows.slice(hr + 1, hr + 16).map(r => clean(labelOf(r))).filter(l => !/合計|本数|モール数|黒帯/.test(l));
    const isColor = next.some(l => COLORS.some(([ch]) => l.startsWith(ch)));
    const isBlack = next.some(l => goldOf(l) != null);
    if (!isColor && !isBlack) {
      continue; // 空手着の号の表など
    }
    if (firstHead < 0) {
      firstHead = hr;
    }
    const above = rows.slice(Math.max(0, hr - 3), hr + 1).flatMap(r => r.filter(c => c)).map(clean).join(' ');
    let r = hr + 1;
    for (; r < rows.length; r++) {
      const label = labelOf(rows[r]);
      const lab = clean(label);
      if (/合計|本数|モール数|ﾓｰﾙ数|金線数/.test(lab) || sizeCols(rows[r])) {
        break;
      }
      const cells = [...sizes.entries()].map(([j, n]) => ({ n, qty: toNum(rows[r][j] ?? '') })).filter(e => e.qty != 0);
      const gold = goldOf(lab);
      const color = COLORS.find(([ch]) => lab.startsWith(ch))?.[1];
      if (isBlack && gold == null && !color && lab && cells.length == 0) {
        continue;
      }
      if (cells.length == 0) {
        continue;
      }
      if (cells.some(c => !Number.isInteger(c.qty) || c.qty < 0)) {
        unknown.push(label + '（数量 ' + cells.map(c => c.qty).join('・') + '）');
        continue;
      }
      if (isBlack && gold != null) {
        if (!order.black) {
          order.black = BLACK_KINDS.find(b => above.includes(b)) ?? 'BBY1';
        }
        cells.forEach(c => order.blackCells.push({ label, size: c.n, gold, qty: c.qty }));
      } else if (color) {
        const ln = /金/.test(lab) ? 'gold' : /銀|ﾓｰﾙ|モール/.test(lab) ? 'silver' : '';
        cells.forEach(c => order.colorCells.push({ label, size: c.n, color, line: ln, qty: c.qty }));
      } else {
        unknown.push(label || (r + 1) + '行目');
      }
    }
    // 黒帯の表のすぐ下の「金モール数」「追加モール数」の行（用紙が数えた本数。確認用）
    if (isBlack && !isColor) {
      for (let k = r; k < Math.min(rows.length, r + 3); k++) {
        if (/金モール数|追加モール数|追加ﾓｰﾙ数/.test(clean(labelOf(rows[k])))) {
          order.goldOnForm = [...sizes.keys()].reduce((s, j) => s + toNum(rows[k][j] ?? ''), 0);
        }
      }
    }
    lastRow = Math.max(lastRow, r);
    hr = r;
  }
  if (firstHead < 0) {
    return null;
  }

  // 色帯の種類（表より上の文字）
  const top = rows.slice(0, firstHead + 1).flatMap(r => r.filter(c => c));
  const title = top.find(c => OBI_KINDS.some(k => k.marks.some(m => clean(c).includes(clean(m))))) ?? '';
  order.title = title.trim();
  order.kind = (OBI_KINDS.find(k => k.key == kindKey) ?? detectKind(top) ?? OBI_KINDS.find(k => k.key == 'CB19')!).key;

  // お客様コード（右の最初の空でないセル。同じ文字が続く結合セルは飛ばす）。「別納」の書き込みは注意に出す
  for (const r of rows.slice(0, firstHead)) {
    const j = r.findIndex(c => /お客様コード|会員コード|顧客コード/.test(clean(c ?? '')));
    if (j >= 0) {
      const v = r.slice(j + 1).find(c => c && !/お客様コード|会員コード|顧客コード/.test(clean(c)));
      order.mcode = v ? (clean(v).match(/^[0-9A-Za-z]+/)?.[0] ?? '') : '';
      if (v && /別納/.test(v)) {
        order.pwarn = '顧客コードの欄に「' + v + '」とあります。納品先を受注伝票で確認してください';
      }
      break;
    }
  }

  // 表より下の備考・上の送り先の記入（確認用。伝票備考にする）
  const bikou: string[] = [];
  for (const row of rows.slice(lastRow + 1)) {
    if (row.some(c => clean(c ?? '').startsWith('備考'))) {
      bikou.push(...row.map(c => (c ?? '').trim()).filter(c => c && !clean(c).startsWith('備考')));
    }
  }
  order.bikou = [...new Set(bikou)].join(' ').slice(0, 200);
  const okuri: string[] = [];
  for (const row of rows.slice(0, firstHead)) {
    if (/^(ご住所|お届け先)/.test(clean(row[0] ?? ''))) {
      okuri.push(...row.slice(1).map(c => (c ?? '').trim()).filter(c => c && !c.startsWith('※') && !/^(ご住所|お届け先)/.test(clean(c))));
    }
  }
  order.okurisaki = [...new Set(okuri)].join(' ');

  if (unknown.length > 0) {
    order.perr = '色・数量を読めない行があります：' + unknown.join('、');
  } else if (order.colorCells.length == 0 && order.blackCells.length == 0) {
    order.perr = '注文の数量がありません';
  }
  // 単価に含む金モールの本数: 用紙が数えた金モール数が「1 本目を含む」の数え方と合えば 1（極真の色帯・黒帯フォーマットなど）。無ければ 0（画面で変えられる）
  if (order.goldOnForm != null) {
    const count = (incl: number) => order.blackCells.reduce((s, c) => s + c.qty * Math.max(0, c.gold - incl), 0);
    if (order.goldOnForm != count(0) && order.goldOnForm == count(1)) {
      order.goldIncl = 1;
    }
  }
  buildObiLines(order);
  return order;
}

/** 用紙の数量と画面の設定から明細を作る（設定を変えたら呼び直す） */
export function buildObiLines(o: ObiOrder): void {
  const kind = OBI_KINDS.find(k => k.key == o.kind) ?? OBI_KINDS.find(k => k.key == 'CB19')!;
  const lines: ObiLine[] = [];
  let mall = 0;
  o.belts = 0;
  o.sv = 0;
  o.blackBelts = 0;
  // 色帯
  for (const c of o.colorCells) {
    const sv = c.line != '';
    const gcode = kind.code(c.size, c.color, sv);
    lines.push(line(gcode, c.label + ' ' + c.size + '号', c.qty, c.line == 'gold' ? '金ﾓｰﾙ入り' : sv ? kind.svMemo : ''));
    o.belts += c.qty;
    if (sv) {
      o.sv += c.qty;
      // 品番が SV 付きの帯は線の代金を含むので、モール代には数えない（二重取りになる）
      if (!gcode.endsWith('SV')) {
        mall += c.qty;
      }
    }
  }
  lines.push(...(kind.extras?.(lines) ?? []));
  if (mall > 0) {
    lines.push(line(MALL_GCODE, '色帯のモール代（半周）', mall, '色帯(半周)', o.mallTanka));
  }
  // 黒帯（号・金モールの本数ごとに 1 行。単価に含む本数を超えた金モールを MALL にする）
  let gold = 0;
  for (const c of o.blackCells) {
    lines.push(line(o.black + '-' + c.size, c.label + ' ' + c.size + '号', c.qty, c.gold > 0 ? '金ﾓｰﾙ' + c.gold + '本' : ''));
    o.blackBelts += c.qty;
    gold += c.qty * Math.max(0, c.gold - o.goldIncl);
  }
  if (gold > 0) {
    lines.push(line(MALL_GCODE, '黒帯の金モール代（一周）', gold, '金/一周', o.goldTanka));
  }
  // 織マーク代（帯の本数分）
  const all = o.belts + o.blackBelts;
  if (o.ori && all > 0) {
    lines.push(line(ORI_GCODE, '織マーク代', all, o.oriMemo, o.oriTanka));
  }
  o.lines = lines;
  // 用紙が数えた金モールの本数と違えば知らせる（単価に含む本数の設定の確認）
  const w = [o.pwarn];
  if (o.goldOnForm != null && o.blackCells.length > 0 && o.goldOnForm != gold) {
    w.push('用紙の金モール数は ' + o.goldOnForm + ' 本ですが、明細の金モール代は ' + gold + ' 本です。「単価に含む金モール」の設定を確認してください');
  }
  o.warn = w.filter(e => e).join('／');
}
