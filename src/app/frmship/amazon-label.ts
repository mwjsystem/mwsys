import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { code39, ean, eanText, Bars } from './../services/barcode';
import type { ShipDoc } from './ship-pdf.service';

/**
 * Amazon 納品の商品に貼る JAN のシール（エーワン 65 面: A4、1 片 38.1 × 21.2 mm、5 列 × 13 段）。
 * 現行の「ラベル屋さん」で JAN の CSV を読み込んで印刷していたものの置き換え。
 * 伝票ごとに、PO 番号のシール 1 枚と、明細の JAN を数量の枚数分並べる。開始位置（1〜65）から詰めて印刷する
 */
export const LABEL_COLS = 5;
export const LABEL_ROWS = 13;
export const LABEL_COUNT = LABEL_COLS * LABEL_ROWS;

const MM = 72 / 25.4;
/** シートの寸法（mm） */
const SHEET = { top: 10.7, left: 4.75, w: 38.1, h: 21.2, gapX: 2.5, gapY: 0 };

export type AmazonLabel =
  | { kind: 'po'; denno: number; po: string }
  | { kind: 'jan'; denno: number; jan: string; gcode: string };

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
        code39(po);
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
        labels.push({ kind: 'jan', denno: d.denno, jan, gcode: l.gcode });
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

function bars(b: Bars, x: number, y: number, width: number, height: number): Content {
  const u = width / b.width;
  return {
    canvas: b.bars.map(e => ({ type: 'rect', x: e.x * u, y: 0, w: e.w * u, h: height, color: '#000000' })),
    absolutePosition: { x, y }
  } as Content;
}

/** シールの幅いっぱいに中央揃えの文字 */
function text(t: string, x: number, y: number, size: number, bold = false): Content {
  return { columns: [{ width: W, text: t, alignment: 'center', fontSize: size, bold, lineHeight: 1 }], absolutePosition: { x, y } } as Content;
}

function labelContent(l: AmazonLabel, x: number, y: number): Content[] {
  if (l.kind == 'jan') {
    // モジュール幅 0.275 mm（標準の 83%）。EAN-13 は 95 モジュールで約 26 mm、前後の余白も入る
    const b = ean(l.jan);
    const bw = b.width * 0.275 * MM;
    return [
      bars(b, x + (W - bw) / 2, y + 8, bw, 34),
      text(eanText(l.jan), x, y + 43, 7.5)
    ];
  }
  const b = code39(l.po);
  const bw = Math.min(W - 12, b.width * 0.75);
  return [
    text('PO', x, y + 3, 6),
    bars(b, x + (W - bw) / 2, y + 12, bw, 28),
    text(l.po, x, y + 42, 8, true)
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
