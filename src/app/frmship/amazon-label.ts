import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { code128, ean, eanText, Bars } from './../services/barcode';
import type { ShipDoc } from './ship-pdf.service';

/**
 * Amazon 納品の商品に貼る JAN のシール（エーワン 65 面: A4、1 片 38.1 × 21.2 mm、5 列 × 13 段）。
 * 現行の「ラベル屋さん」で JAN の CSV を読み込んで印刷していたものの置き換え。
 * 伝票ごとに、PO 番号のシール 1 枚と、明細の JAN（商品コード・商品名付き）を数量の枚数分並べる。
 * 倉庫では 1 伝票ずつ、出荷指示の印刷のあとに開く画面で開始位置を入れて、手差しトレイにセットしたシートに印刷する
 */
export const LABEL_COLS = 5;
export const LABEL_ROWS = 13;
export const LABEL_COUNT = LABEL_COLS * LABEL_ROWS;

const MM = 72 / 25.4;
/** シートの寸法（mm） */
const SHEET = { top: 10.7, left: 4.75, w: 38.1, h: 21.2, gapX: 2.5, gapY: 0 };

export type AmazonLabel =
  | { kind: 'po'; denno: number; po: string }
  | { kind: 'jan'; denno: number; jan: string; gcode: string; gname: string };

/** 印刷の位置合わせ */
export interface LabelOption {
  /** 最初のシートの開始位置（1〜65。左上から右へ数える） */
  start: number;
  /** プリンタのずれの補正（mm。右・下がプラス） */
  dx: number;
  dy: number;
}

/** 伝票から並べるシールを作る。JAN が無い・読めない明細があればまとめてエラー */
export function amazonLabels(docs: ShipDoc[]): AmazonLabel[] {
  const labels: AmazonLabel[] = [];
  const errs: string[] = [];
  for (const d of docs) {
    const po = (d.cusden ?? '').trim();
    if (!po) {
      errs.push('伝票 ' + d.denno + '：PO 番号（客先伝票番号）がありません');
    } else {
      try {
        code128(po);
        labels.push({ kind: 'po', denno: d.denno, po });
      } catch (e) {
        errs.push('伝票 ' + d.denno + '：' + (e as Error).message);
      }
    }
    for (const l of d.lines.filter(e => Number(e.suu ?? 0) > 0)) {
      const jan = (l.jan ?? '').trim();
      try {
        ean(jan);
      } catch (e) {
        errs.push('伝票 ' + d.denno + ' ' + l.gcode + '：' + (jan ? (e as Error).message : '商品マスタに JAN がありません'));
        continue;
      }
      for (let i = 0; i < Math.round(Number(l.suu)); i++) {
        labels.push({ kind: 'jan', denno: d.denno, jan, gcode: (l.gcode ?? '').trim(), gname: (l.gtext ?? '').trim() });
      }
    }
  }
  if (errs.length > 0) {
    throw new Error(errs.join('\n'));
  }
  return labels;
}

/** 次に使う開始位置（印刷したあとの続き） */
export function nextStart(start: number, count: number): number {
  return (start - 1 + count) % LABEL_COUNT + 1;
}

/** 位置 pos（0 から。シートをまたいで通し）のシールの左上（pt） */
function origin(pos: number, opt: LabelOption): { page: number; x: number; y: number } {
  const p = pos % LABEL_COUNT;
  const col = p % LABEL_COLS;
  const row = Math.floor(p / LABEL_COLS);
  return {
    page: Math.floor(pos / LABEL_COUNT),
    x: (SHEET.left + opt.dx + col * (SHEET.w + SHEET.gapX)) * MM,
    y: (SHEET.top + opt.dy + row * (SHEET.h + SHEET.gapY)) * MM
  };
}

const W = SHEET.w * MM;
const H = SHEET.h * MM;

/** レーザーでシールに印刷すると線が太るので、バーを両側から少し細くする（mm。バーの幅の補正） */
const BAR_REDUCE = 0.03 * MM;
function bars(b: Bars, x: number, y: number, width: number, height: number, reduce = BAR_REDUCE): Content {
  const u = width / b.width;
  return {
    canvas: b.bars.map(e => ({ type: 'rect', x: e.x * u + reduce / 2, y: 0, w: e.w * u - reduce, h: height, color: '#000000' })),
    absolutePosition: { x, y }
  } as Content;
}

/** シールの幅いっぱいに中央揃えの文字 */
function text(t: string, x: number, y: number, size: number, bold = false): Content {
  return { columns: [{ width: W, text: t, alignment: 'center', fontSize: size, bold, lineHeight: 1 }], absolutePosition: { x, y } } as Content;
}

/** 幅 width（pt）の 1 行に収まるように切る（全角は fontSize、半角は 0.55 倍の幅とみなす） */
export function fitText(t: string, size: number, width: number): string {
  let w = 0;
  let ret = '';
  for (const ch of t) {
    w += (/[\x20-\x7e｡-ﾟ]/.test(ch) ? 0.55 : 1) * size;
    if (w > width) {
      return ret;
    }
    ret += ch;
  }
  return ret;
}

function labelContent(l: AmazonLabel, x: number, y: number): Content[] {
  if (l.kind == 'jan') {
    // 上から 商品コード・商品名（1 行に収まる分）・JAN のバーコード・JAN の数字。
    // モジュール幅 0.30 mm（標準の 90%）。EAN-13 は 95 モジュールで 28.5 mm、左右に約 4.8 mm の余白が入る
    const b = ean(l.jan);
    const bw = b.width * 0.30 * MM;
    return [
      text(fitText(l.gcode, 6.5, W - 6), x, y + 2.5, 6.5, true),
      text(fitText(l.gname, 5, W - 6), x, y + 9.5, 5),
      bars(b, x + (W - bw) / 2, y + 16, bw, 31),
      text(eanText(l.jan), x, y + 48, 7)
    ];
  }
  // PO 番号（Code128。Code39 では 38.1 mm の幅に収めると線が細すぎて読めなかった）。
  // 左右にモジュール 10 本分の余白を残して幅いっぱいにする（8 文字でモジュール約 0.26 mm）。バーは細めに補正しない
  const b = code128(l.po);
  const m = Math.min(0.4 * MM, W / (b.width + 20));
  const bw = b.width * m;
  return [
    bars(b, x + (W - bw) / 2, y + 5, bw, 39, 0),
    text(l.po, x, y + 46, 8, true)
  ];
}

/** シールの PDF。frame = true は位置合わせ用（普通紙に 65 枚の枠と番号だけ印刷する） */
export function amazonLabelDoc(labels: AmazonLabel[], opt: LabelOption, frame = false): TDocumentDefinitions {
  const start = Math.min(Math.max(Math.floor(opt.start) || 1, 1), LABEL_COUNT) - 1;
  const content: Content[] = [];
  let page = 0;
  const items: { pos: number; c: (x: number, y: number) => Content[] }[] = frame
    ? Array.from({ length: LABEL_COUNT }, (_, i) => ({
      pos: i,
      c: (x: number, y: number) => [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: W, h: H, lineWidth: 0.4, lineColor: '#888888' }], absolutePosition: { x, y } } as Content,
        text(String(i + 1), x, y + H / 2 - 5, 9)
      ]
    }))
    : labels.map((l, i) => ({ pos: start + i, c: (x: number, y: number) => labelContent(l, x, y) }));
  for (const it of items) {
    const o = origin(it.pos, opt);
    while (page < o.page) {
      content.push({ text: '', pageBreak: 'before' });
      page++;
    }
    content.push(...it.c(o.x, o.y));
  }
  if (content.length == 0) {
    content.push({ text: '' });
  }
  return {
    pageSize: 'A4',
    pageMargins: [0, 0, 0, 0],
    content,
    defaultStyle: { fontSize: 8 }
  };
}
