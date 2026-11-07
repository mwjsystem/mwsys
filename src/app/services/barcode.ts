import type { Content } from 'pdfmake/interfaces';

/**
 * バーコードを pdfmake の図形（黒い四角の並び）で描く。画像やフォントを使わないので、印刷しても線がにじまない。
 *   ・Code39: Amazon の PO 番号（現行の納品書と同じ。英大文字・数字・記号 -. $/+%）
 */

/**
 * Code39 の 1 文字（バー・スペースを交互に 9 本。1 が太い）。
 * 数字のバーの組み合わせ（2 of 5）と、太いスペースの位置の組み合わせでできている
 */
const C39: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001',
  '5': '100110000', '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100',
  'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001', 'E': '100011000',
  'F': '001011000', 'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011', 'O': '100010010',
  'P': '001010010', 'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110',
  'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001', 'Y': '110010000',
  'Z': '011010000', '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
  '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010'
};

/** バーの位置と幅（細い線 = 1 の単位） */
export interface Bars { bars: { x: number; w: number }[]; width: number }

/** Code39（前後のスタート・ストップ文字 * は自動で付ける）。使えない文字があればエラー */
export function code39(text: string, wide = 3): Bars {
  const s = '*' + text.toUpperCase() + '*';
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < s.length; i++) {
    const p = C39[s[i]];
    if (!p || (s[i] == '*' && i > 0 && i < s.length - 1)) {
      throw new Error('バーコード（Code39）にできない文字があります：' + text);
    }
    for (let j = 0; j < 9; j++) {
      const w = p[j] == '1' ? wide : 1;
      if (j % 2 == 0) {
        bars.push({ x, w });
      }
      x += w;
    }
    if (i < s.length - 1) {
      x += 1; // 文字の間の細いスペース
    }
  }
  return { bars, width: x };
}

/** バーコードを幅 width・高さ height（pt）の図形にする */
export function barcodeCanvas(b: Bars, width: number, height: number): Content {
  const u = width / b.width;
  return { canvas: b.bars.map(e => ({ type: 'rect', x: e.x * u, y: 0, w: e.w * u, h: height, color: '#000000' })) } as Content;
}
