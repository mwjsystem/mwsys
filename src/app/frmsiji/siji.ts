/**
 * 帯刺繍指示書（Excel）への本数のセット（現行の set_siji.xlsm の置き換え）。
 * 受注明細の帯（商品コード → 色・号は SIJI_MST）を色 × 号に集計し、指示書のシートの表（18〜29 行、D 列 = 色、E〜L 列 = 0〜7 号、
 * M 列 = 8号・00号）・合計（D30）・担当者（G33）・受注先（J33）・伝票番号（J32）に入れる。
 * Excel は exceljs で読み書きすると図形（矢印・テキストボックス）が消えるので、xlsx（zip）の中のシートの XML のセルだけを書き換える。
 */
import { SIJI_MST } from './siji-mst';

const MST = new Map(SIJI_MST.map(([code, color, size]) => [code, { color, size }]));

export interface SijiLine {
  line: number;
  gcode: string;
  suu: number;
  mmemo: string | null;
  /** 指示書の対象の帯か（SIJI_MST にある） */
  target: boolean;
  /** 画面のチェック */
  chk: boolean;
}

/** 色ごとの本数（0〜8 号と 00 号。index 9 = 00 号） */
export type SijiCount = Map<string, number[]>;

/** 帯の色・号（SIJI_MST）。CB19-n-KS（赤・青の 2 色）は赤の色を返す */
export function sijiOf(gcode: string): { color: string; size: string } | undefined {
  return MST.get(gcode.trim()) ?? (/^CB19-.*-KS$/.test(gcode.trim()) ? MST.get(gcode.trim().replace(/KS$/, 'RD')) : undefined);
}

const sizeIndex = (size: string) => size == '00' ? 9 : Number(size);

/**
 * チェックした明細を色 × 号に集計する（現行の set_Dic と同じ。橙・青・黄・緑・茶を先に、ほかの色は出てきた順）。
 * CB19-n-KS は赤（RD）と青（BU）の両方に数える
 */
export function sijiCount(lines: SijiLine[]): SijiCount {
  const ret: SijiCount = new Map(['橙', '青', '黄', '緑', '茶'].map(c => [c, Array(10).fill(0)]));
  const add = (gcode: string, suu: number) => {
    const m = MST.get(gcode);
    if (!m) {
      return;
    }
    const arr = ret.get(m.color) ?? Array(10).fill(0);
    arr[sizeIndex(m.size)] += suu;
    ret.set(m.color, arr);
  };
  for (const l of lines.filter(e => e.chk && e.target)) {
    const g = l.gcode.trim();
    if (/^CB19-.*-KS$/.test(g)) {
      add(g.replace(/KS$/, 'RD'), Number(l.suu) || 0);
      add(g.replace(/KS$/, 'BU'), Number(l.suu) || 0);
    } else {
      add(g, Number(l.suu) || 0);
    }
  }
  return ret;
}

/** 指示書の色の見出し（現行と同じく、5 色はカタカナにする） */
const KANA: Record<string, string> = { '橙': 'ｵﾚﾝｼﾞ', '青': 'ﾌﾞﾙｰ', '黄': 'ｲｴﾛｰ', '緑': 'ｸﾞﾘｰﾝ', '茶': 'ﾌﾞﾗｳﾝ' };

/** 指示書に入れる値（セル番地 → 値。null は空にする） */
export function sijiCells(count: SijiCount, startRow: number, head: { denno: number; staff: string; customer: string }): Map<string, string | number | null> {
  const cells = new Map<string, string | number | null>();
  const cols = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const entries = [...count];
  const has8 = entries.some(([, a]) => a[8] > 0);
  const has00 = entries.some(([, a]) => a[9] > 0);
  // 表を空にする（色の行〜29 行の E〜M、見出しの M）
  cells.set('M' + (startRow - 1), has8 && has00 ? '00/8号' : has8 ? '8号' : has00 ? '00号' : null);
  for (let r = startRow; r <= 29; r++) {
    for (const c of [...cols, 'M']) {
      cells.set(c + r, null);
    }
  }
  let total = 0;
  entries.forEach(([color, a], k) => {
    const r = startRow + k;
    if (r > 29) {
      return;
    }
    cells.set('D' + r, KANA[color] ?? color);
    for (let i = 0; i <= 7; i++) {
      if (a[i] > 0) {
        cells.set(cols[i] + r, a[i]);
      }
    }
    if (has8 && has00) {
      cells.set('M' + r, a[8] > 0 || a[9] > 0 ? (a[8] > 0 ? a[8] : '') + '/' + (a[9] > 0 ? a[9] : '') : null);
    } else if (has8 && a[8] > 0) {
      cells.set('M' + r, a[8]);
    } else if (has00 && a[9] > 0) {
      cells.set('M' + r, a[9]);
    }
    total += a.reduce((s, n) => s + n, 0);
  });
  cells.set('D30', '合計' + total + '本');
  cells.set('J32', head.denno);
  cells.set('G33', head.staff);
  cells.set('J33', head.customer ? head.customer + ' 様' : null);
  return cells;
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const colNum = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const rowNum = (ref: string) => Number(ref.replace(/^[A-Z]+/, ''));

/** シートの XML のセルに値を入れる（書式 s はそのまま。無いセル・行は作る） */
function setCell(doc: Document, ref: string, value: string | number | null) {
  const data = doc.getElementsByTagNameNS(NS, 'sheetData')[0];
  const rn = rowNum(ref);
  let row = [...data.getElementsByTagNameNS(NS, 'row')].find(e => Number(e.getAttribute('r')) == rn);
  if (!row) {
    if (value == null) {
      return;
    }
    row = doc.createElementNS(NS, 'row');
    row.setAttribute('r', String(rn));
    const after = [...data.getElementsByTagNameNS(NS, 'row')].find(e => Number(e.getAttribute('r')) > rn);
    data.insertBefore(row, after ?? null);
  }
  let c = [...row.getElementsByTagNameNS(NS, 'c')].find(e => e.getAttribute('r') == ref);
  if (!c) {
    if (value == null) {
      return;
    }
    c = doc.createElementNS(NS, 'c');
    c.setAttribute('r', ref);
    const after = [...row.getElementsByTagNameNS(NS, 'c')].find(e => colNum(e.getAttribute('r') ?? '') > colNum(ref));
    row.insertBefore(c, after ?? null);
  }
  while (c.firstChild) {
    c.removeChild(c.firstChild);
  }
  c.removeAttribute('t');
  if (value == null || value === '') {
    return;
  }
  if (typeof value == 'number') {
    const v = doc.createElementNS(NS, 'v');
    v.textContent = String(value);
    c.appendChild(v);
  } else {
    c.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(NS, 'is');
    const t = doc.createElementNS(NS, 't');
    t.textContent = value;
    if (/^\s|\s$|\n/.test(value)) {
      t.setAttribute('xml:space', 'preserve');
    }
    is.appendChild(t);
    c.appendChild(is);
  }
}

/** xlsx のシートの一覧（名前・XML のパス・表示状態） */
export async function sijiSheets(zip: import('jszip')): Promise<{ name: string; path: string; state: string }[]> {
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const target = (rid: string) => {
    const m = rels.match(new RegExp('<Relationship[^>]*Id="' + rid + '"[^>]*>')) ?? [''];
    const t = m[0].match(/Target="([^"]+)"/)?.[1] ?? '';
    return t.startsWith('/') ? t.slice(1) : 'xl/' + t;
  };
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const tag = m[0];
    const name = (tag.match(/name="([^"]*)"/)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    return { name, path: target(tag.match(/r:id="([^"]+)"/)?.[1] ?? ''), state: tag.match(/state="([^"]+)"/)?.[1] ?? 'visible' };
  });
}

/** 指示書のシートの、色の表の始まりの行（18〜29 行で D 列が「橙」「ｵﾚﾝｼﾞ」の行。現行の get_StartRow と同じ） */
export async function sijiStartRow(zip: import('jszip'), path: string): Promise<number | null> {
  const xml = await zip.file(path)!.async('string');
  const ss = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml')!.async('string') : '';
  // 共有文字列。空の <si/> も数え、ふりがな（<rPh>）の文字は除く
  const strings = [...ss.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)]
    .map(m => [...(m[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
  for (let r = 18; r <= 29; r++) {
    const m = xml.match(new RegExp('<c r="D' + r + '"[^>]*?(?:/>|>([\\s\\S]*?)</c>)'));
    if (!m?.[1]) {
      continue;
    }
    const v = m[1].match(/<v>([^<]*)<\/v>/)?.[1];
    const isShared = /t="s"/.test(m[0]);
    const text = isShared && v != null ? strings[Number(v)] : (m[1].match(/<t[^>]*>([^<]*)<\/t>/)?.[1] ?? v ?? '');
    if (text == '橙' || text == 'ｵﾚﾝｼﾞ') {
      return r;
    }
  }
  return null;
}

/**
 * 指示書の Excel に値を入れる。選んだシートだけを表示して開くようにする（ほかのシートは非表示にするだけで消さない。
 * シートを消すと図形・画像の参照が壊れるため）。新しい xlsx を返す
 */
export async function sijiFill(file: ArrayBuffer, sheetPath: string, cells: Map<string, string | number | null>): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const sheets = await sijiSheets(zip);
  const idx = sheets.findIndex(s => s.path == sheetPath);
  if (idx < 0) {
    throw new Error('シートが見つかりません');
  }
  // 1. シートのセル
  const xml = await zip.file(sheetPath)!.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('シートを読めませんでした');
  }
  cells.forEach((v, ref) => setCell(doc, ref, v));
  let out = new XMLSerializer().serializeToString(doc);
  // 2. 選んだシートだけ「選択中」にする（ほかのシートの tabSelected を外す）
  for (const s of sheets) {
    const src = s.path == sheetPath ? out : await zip.file(s.path)?.async('string');
    if (src == null) {
      continue;
    }
    let x = src.replace(/ tabSelected="1"/g, '');
    if (s.path == sheetPath) {
      x = x.replace(/<sheetView\b/, '<sheetView tabSelected="1"');
      out = x;
    }
    zip.file(s.path, x);
  }
  // 3. ブック: ほかの表示中のシートを非表示にし、選んだシートを開いたときのシートにする
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  let k = 0;
  wb = wb.replace(/<sheet\b[^>]*\/>/g, tag => {
    const i = k++;
    if (i == idx) {
      return tag.replace(/ state="[^"]*"/, '');
    }
    return /state="veryHidden"/.test(tag) ? tag : /state="/.test(tag) ? tag.replace(/state="[^"]*"/, 'state="hidden"') : tag.replace(/\s*\/>$/, ' state="hidden"/>');
  });
  wb = wb.replace(/<workbookView\b[^>]*?\/?>/, tag => {
    let t = tag.replace(/ activeTab="\d+"/, '').replace(/ firstSheet="\d+"/, '');
    t = t.replace(/<workbookView\b/, '<workbookView activeTab="' + idx + '" firstSheet="' + idx + '"');
    return t;
  });
  zip.file('xl/workbook.xml', wb);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
