/**
 * 価格改定の全情報リスト（Excel。例: _MW CATALOG 商品リスト.xlsx の「2026HIS16全情報のリスト」）の解析。DB に触らない。
 * 列の位置は決め打ちせず、見出しの行（「品番詳細」がある行）の文字で探す。画面で列を選び直せる。
 */
import { cellText } from './../frmtkd/tkd-parse';
import { TankaKey } from './../mstgoods/goods-const';

/** exceljs のシートに必要なところだけ */
export interface SheetLike {
  name: string;
  state?: string;
  rowCount: number;
  columnCount: number;
  getRow(r: number): { getCell(c: number): { value: unknown } };
}

/** 全情報リストの列（見出しの位置。-1 は無し） */
export interface ColMap {
  page: number;
  grp: number;
  gcode: number;
  name: number;
  teika: number;
  dojo: number;
  hojin: number;
  fc: number;
}

export const COL_LABELS: Record<keyof ColMap, string> = {
  page: '頁', grp: '品番', gcode: '品番詳細（商品コード）', name: '商品名', teika: '新定価（税抜）',
  dojo: '道場卸価格（税抜）', hojin: '法人卸価格（税抜）', fc: 'FC卸価格（税抜）'
};

/** 読んだ 1 行 */
export interface PriceSrc {
  /** Excel の行番号（1 始まり） */
  row: number;
  page: number | null;
  /** 品番（空の行は上の行の品番を引き継ぐ） */
  grp: string;
  gcode: string;
  name: string;
  /** 新定価（税抜） */
  teika: number | null;
  dojo: number | null;
  hojin: number | null;
  fc: number | null;
}

/** シートの全部のセルを文字にする（0 始まり） */
export function sheetCells(ws: SheetLike, maxCols = 60): string[][] {
  const rows: string[][] = [];
  const nc = Math.min(ws.columnCount, maxCols);
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const v: string[] = [];
    for (let c = 1; c <= nc; c++) {
      v.push(cellText(row.getCell(c).value).trim());
    }
    rows.push(v);
  }
  return rows;
}

/** 見出しの行（0 始まり）。「品番詳細」がある最初の行（無ければ -1） */
export function findHeader(rows: string[][], limit = 30): number {
  for (let r = 0; r < Math.min(rows.length, limit); r++) {
    if (rows[r].some(c => c.includes('品番詳細'))) {
      return r;
    }
  }
  return -1;
}

const norm = (s: string) => s.replace(/\s/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')');

/** 見出しの文字から列を決める（同じ見出しが 2 つあるときは左の列） */
export function guessCols(header: string[]): ColMap {
  const h = header.map(norm);
  const find = (f: (s: string) => boolean) => h.findIndex(f);
  return {
    page: find(s => s == '頁'),
    grp: find(s => s == '品番'),
    gcode: find(s => s.includes('品番詳細')),
    name: find(s => s == '商品名' || s == '商品名称'),
    teika: find(s => s.includes('新定価') && s.includes('税抜')),
    dojo: find(s => s.includes('道場卸')),
    hojin: find(s => s.includes('法人卸')),
    fc: find(s => s.startsWith('FC') && s.includes('卸'))
  };
}

/** 「¥8,500」「8500.0」などを数にする（空・数でないときは null） */
export function toNum(s: string | undefined): number | null {
  if (s == null) {
    return null;
  }
  const t = s.replace(/[¥￥,\s円]/g, '');
  if (t == '' || t == '-' || t == '－') {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 見出しの下の行を読む。商品コードの無い行・商品コードが「-」の行は飛ばす */
export function readPrices(rows: string[][], headerRow: number, m: ColMap): PriceSrc[] {
  const ret: PriceSrc[] = [];
  let grp = '';
  let page: number | null = null;
  const at = (r: string[], c: number) => (c >= 0 ? r[c] ?? '' : '');
  for (let r = headerRow + 1; r < rows.length; r++) {
    const v = rows[r];
    const g = at(v, m.grp);
    if (g) {
      grp = g;
    }
    const p = toNum(at(v, m.page));
    if (p != null) {
      page = p;
    }
    const gcode = at(v, m.gcode).toUpperCase();
    if (!gcode || gcode == '-' || gcode.includes('品番詳細')) {
      continue;
    }
    ret.push({
      row: r + 1, page: p ?? page, grp, gcode, name: at(v, m.name),
      teika: toNum(at(v, m.teika)), dojo: toNum(at(v, m.dojo)), hojin: toNum(at(v, m.hojin)), fc: toNum(at(v, m.fc))
    });
  }
  return ret;
}

/**
 * 単価の列ごとの決め方。
 *  teika: 新定価（税抜）× 1.1（tanka1 の通販定価（税込）） / dojo・hojin・fc: 全情報リストのその列（税抜）
 *  rate: 今の掛率のまま新定価から計算し直す / keep: 今の値のまま
 */
export type TankaRule = 'teika' | 'dojo' | 'hojin' | 'fc' | 'rate' | 'keep';

/** 単価の列の決め方の初期値（id=1: tanka2 道場価格・tanka3 代理店価格・tanka7 FC価格） */
export const DEFAULT_RULES: Record<TankaKey, TankaRule> = {
  tanka1: 'teika', tanka2: 'dojo', tanka3: 'hojin', tanka4: 'keep', tanka5: 'rate',
  tanka6: 'rate', tanka7: 'fc', tanka8: 'rate', tanka9: 'keep'
};

/** 円に丸める（四捨五入。8500 × 1.1 のような小数の誤差を消してから） */
export const yen = (n: number) => Math.round(Math.round(n * 1000) / 1000);
