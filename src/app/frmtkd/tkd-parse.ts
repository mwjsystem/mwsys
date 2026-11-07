/**
 * TKD（東海堂 Ｙ）の請求 Excel（TKD請求yyyymm.xlsx）の解析。DB に触らない。
 * 現行の「TH_TKD伝票登録03.xlsm」（通販Pro の伝票登録 CSV を作るマクロ）の置き換え。
 * 見出しの行（日付・品番・品名・数量・単価・合計・備考）の次から読み、日付ごとに 1 伝票にする。
 * 日付はその日の最初の行にだけ入っているので、空の行は前の行の日付を引き継ぐ。単価は税抜。
 */

export interface TkdLine {
  /** Excel の行番号（エラーの表示用） */
  row: number;
  gcode: string;
  /** Excel の品名（このまま受注明細の品名にする） */
  gtext: string;
  qty: number;
  /** 単価（税抜） */
  price: number;
  /** Excel の合計（数量 × 単価 と合っているかの確認用） */
  total: number | null;
  /** 備考（3584・Y02021 などの番号。明細備考にする） */
  memo: string;
  /** 以下は DB で解決する */
  taxrate: number;
  genka: number;
}

export interface TkdOrder {
  /** 受注日（Excel の日付。yyyy-mm-dd） */
  day: string;
  /** 伝票備考（2026/03/02分） */
  dmemo: string;
  lines: TkdLine[];
  /** 以下は DB で解決する */
  err: string;
  result: string;
  denno: number | null;
}

const COLS = { day: '日付', gcode: '品番', gtext: '品名', qty: '数量', price: '単価', total: '合計', memo: '備考' } as const;

/** セルの値を文字にする（exceljs のリッチテキスト・数式の結果も） */
export function cellText(v: unknown): string {
  if (v == null) {
    return '';
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (typeof v == 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (o.richText) {
      return o.richText.map(e => e.text).join('');
    }
    if ('result' in o) {
      return cellText(o.result);
    }
    if (o.text != null) {
      return String(o.text);
    }
  }
  return String(v).trim();
}

/** セルの数値（数式は結果）。数値でなければ null */
function cellNum(v: unknown): number | null {
  if (v != null && typeof v == 'object' && !(v instanceof Date) && 'result' in (v as object)) {
    return cellNum((v as { result: unknown }).result);
  }
  const s = cellText(v).replace(/,/g, '');
  if (s == '') {
    return null;
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 日付のセル（Date・Excel のシリアル値・2026/03/02 の文字）を yyyy-mm-dd にする。日付でなければ null */
export function cellDay(v: unknown): string | null {
  if (v != null && typeof v == 'object' && !(v instanceof Date) && 'result' in (v as object)) {
    return cellDay((v as { result: unknown }).result);
  }
  if (v instanceof Date) {
    // exceljs は日付を UTC の 0 時で返す
    return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1) + '-' + pad(v.getUTCDate());
  }
  if (typeof v == 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  const m = cellText(v).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return m ? m[1] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3])) : null;
}

/** 受注日の月末（売上日。月初に前月分を処理するので、処理する日から見て前月末になる） */
export function monthEnd(day: string): string {
  const [y, m] = day.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/** シートの行（各行はセルの値の配列。0 番目が A 列）を、日付ごとの伝票にする */
export function parseTkd(rows: unknown[][]): TkdOrder[] {
  const hi = rows.findIndex(r => (r ?? []).some(c => cellText(c) == COLS.gcode) && (r ?? []).some(c => cellText(c) == COLS.qty));
  if (hi < 0) {
    throw new Error('見出しの行（日付・品番・品名・数量・単価・合計・備考）が見つかりません');
  }
  const head = rows[hi].map(c => cellText(c));
  const idx = {} as Record<keyof typeof COLS, number>;
  const missing: string[] = [];
  (Object.keys(COLS) as (keyof typeof COLS)[]).forEach(k => {
    idx[k] = head.indexOf(COLS[k]);
    if (idx[k] < 0) {
      missing.push(COLS[k]);
    }
  });
  if (missing.length > 0) {
    throw new Error('Excel に次の列がありません：' + missing.join('、'));
  }
  const orders: TkdOrder[] = [];
  let cur: TkdOrder | null = null;
  const errs: string[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNo = i + 1;
    const gcode = cellText(r[idx.gcode]);
    const dayCell = r[idx.day];
    if (cellText(dayCell) != '') {
      const day = cellDay(dayCell);
      if (!day) {
        errs.push(rowNo + ' 行目：日付が読めません（' + cellText(dayCell) + '）');
        cur = null;
        continue;
      }
      if (!cur || cur.day != day) {
        cur = { day, dmemo: day.replace(/-/g, '/') + '分', lines: [], err: '', result: '', denno: null };
        orders.push(cur);
      }
    }
    if (gcode == '') {
      continue;
    }
    if (!cur) {
      errs.push(rowNo + ' 行目：日付がありません（' + gcode + '）');
      continue;
    }
    const qty = cellNum(r[idx.qty]);
    const price = cellNum(r[idx.price]);
    cur.lines.push({
      row: rowNo, gcode, gtext: cellText(r[idx.gtext]), qty: qty ?? 0, price: price ?? 0, total: cellNum(r[idx.total]),
      memo: cellText(r[idx.memo]), taxrate: 10, genka: 0
    });
    if (qty == null || qty == 0) {
      cur.err = (cur.err ? cur.err + '／' : '') + rowNo + ' 行目：数量がありません';
    }
    if (price == null) {
      cur.err = (cur.err ? cur.err + '／' : '') + rowNo + ' 行目：単価がありません';
    }
  }
  if (errs.length > 0) {
    throw new Error(errs.join('\n'));
  }
  return orders.filter(o => o.lines.length > 0);
}

/** Excel の合計が 数量 × 単価 と合わない明細 */
export function totalDiff(l: TkdLine): boolean {
  return l.total != null && Math.round(l.total) != Math.round(l.qty * l.price);
}
