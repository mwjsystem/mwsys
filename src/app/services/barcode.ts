import type { Content } from 'pdfmake/interfaces';

/**
 * バーコードを pdfmake の図形（黒い四角の並び）で描く。画像やフォントを使わないので、印刷しても線がにじまない。
 *   ・Code39: Amazon の PO 番号（現行の納品書と同じ。英大文字・数字・記号 -. $/+%）
 *   ・JAN（EAN-13 / EAN-8）: Amazon 納品の商品に貼るシール
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

/** JAN（EAN）の数字のパターン（L: 左側の奇数パリティ、G: 左側の偶数パリティ、R: 右側） */
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** EAN-13 の先頭の数字で決まる、左側 6 桁のパリティ */
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** JAN のチェックデジット（最後の桁を除いた数字から計算） */
function eanCheck(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // 右から数えて奇数番目に 3 を掛ける
    sum += Number(body[body.length - 1 - i]) * (i % 2 == 0 ? 3 : 1);
  }
  return (10 - sum % 10) % 10;
}

/**
 * JAN（EAN-13・EAN-8）。1 = モジュール 1 本分の幅。チェックデジットが合わないとエラー。
 * 前後の余白（クワイエットゾーン 左 11・右 7 モジュール）は含まない
 */
export function ean(jan: string): Bars {
  const s = (jan ?? '').trim();
  if (!/^(\d{8}|\d{13})$/.test(s)) {
    throw new Error('JAN は 13 桁か 8 桁の数字にしてください：' + s);
  }
  if (eanCheck(s.slice(0, -1)) != Number(s.slice(-1))) {
    throw new Error('JAN のチェックデジットが違います：' + s);
  }
  const half = s.length == 13 ? 6 : 4;
  const left = s.length == 13 ? s.slice(1, 7) : s.slice(0, 4);
  const right = s.slice(-half);
  const parity = s.length == 13 ? EAN_PARITY[Number(s[0])] : 'LLLL';
  const pattern = '101' +
    [...left].map((c, i) => (parity[i] == 'L' ? EAN_L : EAN_G)[Number(c)]).join('') +
    '01010' +
    [...right].map(c => EAN_R[Number(c)]).join('') +
    '101';
  const bars: { x: number; w: number }[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] == '1') {
      const last = bars[bars.length - 1];
      if (last && last.x + last.w == i) {
        last.w++;
      } else {
        bars.push({ x: i, w: 1 });
      }
    }
  }
  return { bars, width: pattern.length };
}

/** バーコードの下に出す JAN の数字（EAN-13 は 1 桁・6 桁・6 桁に区切る） */
export function eanText(jan: string): string {
  const s = jan.trim();
  return s.length == 13 ? s[0] + ' ' + s.slice(1, 7) + ' ' + s.slice(7) : s.slice(0, 4) + ' ' + s.slice(4);
}

/** バーコードを幅 width・高さ height（pt）の図形にする */
export function barcodeCanvas(b: Bars, width: number, height: number): Content {
  const u = width / b.width;
  return { canvas: b.bars.map(e => ({ type: 'rect', x: e.x * u, y: 0, w: e.w * u, h: height, color: '#000000' })) } as Content;
}
