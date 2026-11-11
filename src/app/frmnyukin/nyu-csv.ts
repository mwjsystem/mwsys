/** 入金の取込（入金テキスト・佐川代引）で使う、CSV の読み込みと名前（カナ）の照合 */

/** ファイルを文字にする（UTF-8 でなければ Shift_JIS） */
export async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

/** CSV を行と列に分ける（"..." で囲んだ列の中のカンマ・改行・"" に対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c == '"') {
        if (text[i + 1] == '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += c;
      }
    } else if (c == '"') {
      q = true;
    } else if (c == ',') {
      row.push(cur);
      cur = '';
    } else if (c == '\n' || c == '\r') {
      if (c == '\r' && text[i + 1] == '\n') {
        i++;
      }
      row.push(cur);
      cur = '';
      if (row.some(e => e.trim() !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some(e => e.trim() !== '')) {
    rows.push(row);
  }
  return rows;
}

/** 金額の文字（"12,000"・"  7260"）を数にする（読めなければ NaN） */
export function money(s: string | undefined): number {
  const t = String(s ?? '').replace(/[,\s円¥￥]/g, '');
  return t === '' ? NaN : Number(t);
}

const SMALL: Record<string, string> = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ヵ': 'カ', 'ヶ': 'ケ' };

/**
 * 名前（カナ）をくらべられる形にする。半角カナは全角に、ひらがなはカタカナに、小さい字は大きい字にし、
 * 空白・長音・記号・法人の略号（カ) (カ ユ) など）を除く（銀行の振込人名は大文字の半角カナで、長音が "-" になっている）
 */
export function normKana(s: string | null | undefined): string {
  let t = String(s ?? '').normalize('NFKC');
  t = t.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  t = t.replace(/[ァィゥェォッャュョヮヵヶ]/g, c => SMALL[c] ?? c);
  t = t.toUpperCase();
  // 法人の略号: カ)・(カ・ユ)・(ユ・ド)・シヤ)・ザイ) など
  t = t.replace(/\((カ|ユ|ド|シヤ|ザイ|イ|ガク|フク|ゴ|メ)\)?$/, '').replace(/^\(?(カ|ユ|ド|シヤ|ザイ|イ|ガク|フク|ゴ|メ)\)/, '');
  t = t.replace(/(カブシキガイシヤ|ユウゲンガイシヤ|ゴウドウガイシヤ)/g, '');
  return t.replace(/[\s\-ー－‐―・.,()（）「」'"/]/g, '');
}

/** 振込人名と顧客のカナが合うか（どちらかがもう一方を含む。2 文字以上） */
export function kanaMatch(payer: string, kana: string): boolean {
  const a = normKana(payer);
  const b = normKana(kana);
  if (a.length < 2 || b.length < 2) {
    return false;
  }
  return a.includes(b) || b.includes(a);
}
