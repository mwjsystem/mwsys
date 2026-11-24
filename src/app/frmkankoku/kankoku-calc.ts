/**
 * 発注勧告の計算（現行の【原本】発注勧告.xlsm の Span マクロが旧システムの DB から読んでいた値）。
 * 画面（frmkankoku）から使い、結果は「発注勧告データ.xlsx」にして Span マクロ（batch/hatkankoku/Module1.bas）が読む。
 */

/** 関東倉庫 */
export const KANTO_SCODE = '016';
/** 関東倉庫の商品は、発注シートの品番の後ろにこれが付く */
export const KANTO_MARK = '【関東倉庫】';
/** 関東倉庫以外で在庫を足す倉庫（現行: 01 + 001 + 015）と、受注残を足す倉庫（01 + 001） */
export const MAIN_ZAIKO_SCODES = ['01', '001', '015'];
export const MAIN_JUZAN_SCODES = ['01', '001'];
/** 発注残を見る倉庫（現行の get_hattyuzan） */
export const MAIN_HATZN_SCODE = '01';
/** 受注可能数も加工した後の品番に足す、加工品（ヘッドガード）の品番 */
export const HG_PATTERN = /^(HGKP|KHS|SKHG)/;
/** これより前の発注は古い移行データなので見ない（在庫・発注チェックと同じ） */
export const HATZN_FROM = '2019-06-28';

/** 出荷・発注残の集計の区分。'他' = 関東倉庫以外、'016' = 関東倉庫 */
export type Grp = '他' | '016';

export interface StockIn { scode: string; gcode: string; zaiko: number; juzan: number }
export interface SyukIn { gcode: string; scode: string; suu: number }
export interface HatzIn { day: string; scode: string; gcode: string; yday: string; suu: number; hatzn: number }

/** 発注シートの 1 行（海外・OEM 以外） */
export interface SheetItem { row: number; code: string; gcode: string; grp: Grp; gtext: string; vname: string }
/** 加工品シートの 1 行（追加元 → 追加先） */
export interface KakoItem { from: string; to: string }

/** データ.xlsx の 1 行（種類・商品コード・キー・値・値2） */
export interface DataRow { kind: '在庫' | '発注残' | '出荷' | '発注月' | '入荷'; gcode: string; key: string; v1: number | string; v2: number | '' }

/** 画面の一覧の 1 行（Span マクロが書き込む値と同じ計算） */
export interface PreviewRow {
  row: number; code: string; gtext: string; vname: string;
  kano: number; zan: number; syuk: number; months: number[]; inday: string; insuu: number;
}

export const grpOf = (scode: string): Grp => scode == KANTO_SCODE ? '016' : '他';

/** yyyy-mm-dd の日付から、n か月前の yyyymm */
export function ymBefore(day: string, n: number): string {
  const d = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 - n, 1);
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
}

/** yyyymm の月の初日と末日（yyyy-mm-dd） */
export function monthRange(ym: string): { from: string; to: string } {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`, to: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-${String(last).padStart(2, '0')}` };
}

/** 発注シートの品番から、商品コードと区分（【関東倉庫】が付いていれば 016） */
export function splitCode(code: string): { gcode: string; grp: Grp } {
  const c = code.trim();
  return c.endsWith(KANTO_MARK) ? { gcode: c.slice(0, -KANTO_MARK.length).trim(), grp: '016' } : { gcode: c, grp: '他' };
}

export interface Calc {
  /** 倉庫|商品 → 在庫・受注残 */
  stock: Map<string, { zaiko: number; juzan: number }>;
  /** 区分|商品 → 先月の出荷数 */
  syuk: Map<string, number>;
  /** 倉庫|商品 → 発注残 */
  zan: Map<string, number>;
  /** 区分|商品|yyyymm → 発注月ごとの発注残 */
  month: Map<string, number>;
  /** 区分|商品 → 最短の入荷予定日（yyyy-mm-dd）とその日の発注数 */
  inday: Map<string, { day: string; suu: number }>;
}

/**
 * DB の値を Span マクロの関数ごとにまとめる。
 * months: 発注数を見る月（現行は基準日の 6 か月前 〜 1 か月前）
 */
export function buildCalc(stock: StockIn[], syuk: SyukIn[], hatz: HatzIn[], months: string[]): Calc {
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const c: Calc = { stock: new Map(), syuk: new Map(), zan: new Map(), month: new Map(), inday: new Map() };
  stock.forEach(s => c.stock.set(s.scode + '|' + s.gcode, { zaiko: s.zaiko, juzan: s.juzan }));
  syuk.forEach(s => add(c.syuk, grpOf(s.scode) + '|' + s.gcode, s.suu));
  const ms = new Set(months);
  hatz.forEach(h => {
    const g = grpOf(h.scode);
    add(c.zan, h.scode + '|' + h.gcode, h.hatzn);
    const ym = h.day.slice(0, 4) + h.day.slice(5, 7);
    if (ms.has(ym)) {
      add(c.month, g + '|' + h.gcode + '|' + ym, h.hatzn);
    }
    if (h.yday) {
      const k = g + '|' + h.gcode;
      const cur = c.inday.get(k);
      if (!cur || h.yday < cur.day) {
        c.inday.set(k, { day: h.yday, suu: h.suu });
      } else if (h.yday == cur.day) {
        cur.suu += h.suu;
      }
    }
  });
  return c;
}

const st = (c: Calc, scode: string, gcode: string) => c.stock.get(scode + '|' + gcode) ?? { zaiko: 0, juzan: 0 };

/** 関東倉庫以外の 受注可（01・001・015 の在庫 − 01・001 の受注残。ヘッドガードの加工品は現行どおり 01 の受注残だけ引く） */
export function mainKano(c: Calc, gcode: string, juzanScodes = MAIN_JUZAN_SCODES): number {
  const zaiko = MAIN_ZAIKO_SCODES.reduce((a, s) => a + st(c, s, gcode).zaiko, 0);
  const juzan = juzanScodes.reduce((a, s) => a + st(c, s, gcode).juzan, 0);
  return zaiko - juzan;
}

/** 画面の一覧（Span マクロが発注シートに書く値。加工品の出荷数・ヘッドガードの受注可は追加先に足す） */
export function preview(items: SheetItem[], kako: KakoItem[], c: Calc, months: string[]): PreviewRow[] {
  const rows = items.map(it => {
    const k = it.grp + '|' + it.gcode;
    const kano = it.grp == '016'
      ? st(c, KANTO_SCODE, it.gcode).zaiko - st(c, KANTO_SCODE, it.gcode).juzan
      : mainKano(c, it.gcode);
    const zan = c.zan.get((it.grp == '016' ? KANTO_SCODE : MAIN_HATZN_SCODE) + '|' + it.gcode) ?? 0;
    const ind = c.inday.get(k);
    return {
      row: it.row, code: it.code, gtext: it.gtext, vname: it.vname, kano, zan, syuk: c.syuk.get(k) ?? 0,
      months: months.map(ym => c.month.get(k + '|' + ym) ?? 0), inday: ind?.day ?? '', insuu: ind?.suu ?? 0
    };
  });
  const byCode = new Map<string, PreviewRow>();
  rows.forEach(r => byCode.set(r.code, r));
  kako.forEach(k => {
    const to = byCode.get(k.to);
    if (!to) {
      return;
    }
    to.syuk += c.syuk.get('他|' + k.from) ?? 0;
    if (HG_PATTERN.test(k.from)) {
      to.kano += mainKano(c, k.from, ['01']);
    }
  });
  return rows;
}

/** データ.xlsx の行（対象の商品だけ。0 の値は書かない。マクロは無い値を 0 として読む） */
export function dataRows(gcodes: string[], c: Calc, months: string[]): DataRow[] {
  const out: DataRow[] = [];
  const scodes = [...MAIN_ZAIKO_SCODES, KANTO_SCODE];
  for (const g of gcodes) {
    for (const s of scodes) {
      const v = c.stock.get(s + '|' + g);
      if (v && (v.zaiko || v.juzan)) {
        out.push({ kind: '在庫', gcode: g, key: s, v1: v.zaiko, v2: v.juzan });
      }
    }
    for (const s of [MAIN_HATZN_SCODE, KANTO_SCODE]) {
      const v = c.zan.get(s + '|' + g);
      if (v) {
        out.push({ kind: '発注残', gcode: g, key: s, v1: v, v2: '' });
      }
    }
    for (const grp of ['他', '016'] as Grp[]) {
      const sy = c.syuk.get(grp + '|' + g);
      if (sy) {
        out.push({ kind: '出荷', gcode: g, key: grp, v1: sy, v2: '' });
      }
      months.forEach(ym => {
        const v = c.month.get(grp + '|' + g + '|' + ym);
        if (v) {
          out.push({ kind: '発注月', gcode: g, key: grp + '|' + ym, v1: v, v2: '' });
        }
      });
      const ind = c.inday.get(grp + '|' + g);
      if (ind) {
        out.push({ kind: '入荷', gcode: g, key: grp, v1: ind.day.replace(/-/g, ''), v2: ind.suu });
      }
    }
  }
  return out;
}
