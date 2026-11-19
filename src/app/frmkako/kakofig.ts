import type { KakoPosi } from './kako.service';

/**
 * 加工指示書の図（道着の上衣の前・後ろ、ズボン、帯の両端の表裏）。
 * 位置と内容の行から、図のその位置に刺繍の図（画像）か文字を描き、行の番号の札を付ける。
 * ブラウザの canvas で描いて PNG にする（画面の見本と指示書の PDF で同じ絵を使う。日本語の文字もそのまま描ける）
 */

type Panel = 'front' | 'back' | 'pants' | 'belt';

/** 図の上の位置（各パネルの中の座標。パネルの大きさは PANELS） */
interface Spot { panel: Panel; x: number; y: number; w: number; h: number }

const PANELS: Record<Panel, { w: number; h: number; title: string }> = {
  front: { w: 400, h: 320, title: '上衣（前）' },
  back: { w: 400, h: 320, title: '上衣（後ろ）' },
  pants: { w: 220, h: 320, title: 'ズボン（前）' },
  belt: { w: 320, h: 320, title: '帯（両端）' }
};

/** 帯の 4 本（A 端の表・裏、B 端の表・裏）の左端 */
const BELT_X = [14, 84, 176, 246];
const BELT_W = 60;

/**
 * 位置の名前 → 図の上の場所。前から見た絵なので、着る人の左（左胸・左袖）は絵の右側。
 * 「帯表」「帯裏」は前の名前（A 端として描く）
 */
export const POSI_SPOTS: Record<string, Spot> = {
  '胸': { panel: 'front', x: 226, y: 66, w: 62, h: 160 },
  '右胸': { panel: 'front', x: 112, y: 58, w: 56, h: 62 },
  '右袖': { panel: 'front', x: 22, y: 64, w: 76, h: 76 },
  '左袖': { panel: 'front', x: 302, y: 64, w: 76, h: 76 },
  // 前の下（着る人の左の裾）。オリマークなどを付ける場所（オリマークは位置ではなく内容に入れる）
  '左裾': { panel: 'front', x: 248, y: 252, w: 40, h: 40 },
  '背中': { panel: 'back', x: 125, y: 78, w: 150, h: 150 },
  '襟': { panel: 'back', x: 160, y: 48, w: 80, h: 24 },
  '右足': { panel: 'pants', x: 34, y: 60, w: 60, h: 120 },
  '左足': { panel: 'pants', x: 126, y: 60, w: 60, h: 120 },
  'A表': { panel: 'belt', x: BELT_X[0] + 5, y: 44, w: BELT_W - 10, h: 230 },
  'A裏': { panel: 'belt', x: BELT_X[1] + 5, y: 44, w: BELT_W - 10, h: 230 },
  'B表': { panel: 'belt', x: BELT_X[2] + 5, y: 44, w: BELT_W - 10, h: 230 },
  'B裏': { panel: 'belt', x: BELT_X[3] + 5, y: 44, w: BELT_W - 10, h: 230 },
  '帯表': { panel: 'belt', x: BELT_X[0] + 5, y: 44, w: BELT_W - 10, h: 230 },
  '帯裏': { panel: 'belt', x: BELT_X[1] + 5, y: 44, w: BELT_W - 10, h: 230 }
};

/** 位置の名前（前後の空白・全角英字を直す）→ 図の上の場所。図に出ない位置は undefined */
export function spotOf(posi: string): Spot | undefined {
  const k = (posi ?? '').trim().replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return POSI_SPOTS[k];
}

export interface KakoFigure { url: string; width: number; height: number }

const SCALE = 2;
const PAD = 10;
const TITLE_H = 18;
const LINE = '#333333';

/** 画像（data URL）を読む。読めなければ null */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 上衣の輪郭（前・後ろで同じ）。袖は横に広げた形 */
function jacketOutline(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(168, 25);
  c.lineTo(105, 45);
  c.lineTo(15, 55);
  c.lineTo(15, 150);
  c.lineTo(105, 150);
  c.lineTo(105, 300);
  c.lineTo(295, 300);
  c.lineTo(295, 150);
  c.lineTo(385, 150);
  c.lineTo(385, 55);
  c.lineTo(295, 45);
  c.lineTo(232, 25);
  c.closePath();
  c.fillStyle = '#ffffff';
  c.fill();
  c.stroke();
  // 袖付けの縫い目
  c.save();
  c.setLineDash([4, 3]);
  c.beginPath();
  c.moveTo(105, 45);
  c.lineTo(105, 150);
  c.moveTo(295, 45);
  c.lineTo(295, 150);
  c.stroke();
  c.restore();
}

function drawFront(c: CanvasRenderingContext2D) {
  jacketOutline(c);
  // 後ろの襟（首の後ろ）
  c.beginPath();
  c.moveTo(168, 25);
  c.quadraticCurveTo(200, 14, 232, 25);
  c.stroke();
  // 襟（着る人の右から左へ斜めに下りる帯）と、下の前身頃の襟
  c.beginPath();
  c.moveTo(232, 25);
  c.lineTo(105, 262);
  c.moveTo(256, 33);
  c.lineTo(132, 300);
  c.moveTo(168, 25);
  c.lineTo(197, 90);
  c.stroke();
}

function drawBack(c: CanvasRenderingContext2D) {
  jacketOutline(c);
  // 襟（首の後ろ）
  c.beginPath();
  c.moveTo(168, 25);
  c.quadraticCurveTo(200, 40, 232, 25);
  c.moveTo(160, 28);
  c.quadraticCurveTo(200, 52, 240, 28);
  c.stroke();
  // 背縫い
  c.save();
  c.setLineDash([4, 3]);
  c.beginPath();
  c.moveTo(200, 46);
  c.lineTo(200, 300);
  c.stroke();
  c.restore();
}

function drawPants(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(30, 40);
  c.lineTo(22, 300);
  c.lineTo(96, 300);
  c.lineTo(110, 125);
  c.lineTo(124, 300);
  c.lineTo(198, 300);
  c.lineTo(190, 40);
  c.closePath();
  c.fillStyle = '#ffffff';
  c.fill();
  c.stroke();
  c.beginPath();
  c.rect(30, 22, 160, 18);
  c.fill();
  c.stroke();
}

function drawBelt(c: CanvasRenderingContext2D, dark: boolean) {
  const names = ['A 表', 'A 裏', 'B 表', 'B 裏'];
  BELT_X.forEach((x, i) => {
    c.fillStyle = dark ? '#2b2b2b' : '#f4f4f4';
    c.fillRect(x, 32, BELT_W, 270);
    c.strokeRect(x, 32, BELT_W, 270);
    // 縫い目
    c.save();
    c.strokeStyle = dark ? '#777777' : '#bbbbbb';
    c.setLineDash([3, 4]);
    c.beginPath();
    for (const dx of [8, BELT_W / 2, BELT_W - 8]) {
      c.moveTo(x + dx, 36);
      c.lineTo(x + dx, 298);
    }
    c.stroke();
    c.restore();
    // 帯の先（下が端）
    c.fillStyle = '#000000';
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillText(names[i], x + BELT_W / 2, 26);
  });
  c.fillStyle = '#555555';
  c.font = '10px sans-serif';
  c.textAlign = 'center';
  c.fillText('▼ 帯の端', 160, 314);
}

/** 文字を場所に収まるように描く（縦長の場所は縦書き） */
function drawText(c: CanvasRenderingContext2D, text: string, s: Spot, color: string) {
  const t = text.trim();
  if (!t) {
    return;
  }
  c.save();
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const chars = [...t];
  if (s.h > s.w * 1.2) {
    const size = Math.max(7, Math.min(s.w * 0.8, (s.h - 4) / chars.length, 40));
    c.font = 'bold ' + size + 'px serif';
    const top = s.y + (s.h - size * chars.length) / 2 + size / 2;
    chars.forEach((ch, i) => {
      // 長音・括弧などは縦書きでは向きを変える
      if (/[ー－～\-（）()「」【】]/.test(ch)) {
        c.save();
        c.translate(s.x + s.w / 2, top + i * size);
        c.rotate(Math.PI / 2);
        c.fillText(ch, 0, 0);
        c.restore();
      } else {
        c.fillText(ch, s.x + s.w / 2, top + i * size);
      }
    });
  } else {
    let size = Math.min(s.h * 0.8, 40);
    c.font = 'bold ' + size + 'px serif';
    const w = c.measureText(t).width;
    if (w > s.w - 4) {
      size = Math.max(6, size * (s.w - 4) / w);
      c.font = 'bold ' + size + 'px serif';
    }
    c.fillText(t, s.x + s.w / 2, s.y + s.h / 2);
  }
  c.restore();
}

/** 画像を場所に収まるように（縦横比を保って）描く */
function drawImg(c: CanvasRenderingContext2D, img: HTMLImageElement, s: Spot) {
  const r = Math.min(s.w / img.width, s.h / img.height);
  const w = img.width * r;
  const h = img.height * r;
  c.drawImage(img, s.x + (s.w - w) / 2, s.y + (s.h - h) / 2, w, h);
}

/** 行の番号の札（指示書の「位置と内容」の番号と同じ） */
function drawTag(c: CanvasRenderingContext2D, no: number, s: Spot, panelW: number) {
  const size = 15;
  let x = s.x - size - 2;
  if (x < 1) {
    x = Math.min(s.x + s.w + 2, panelW - size - 1);
  }
  const y = Math.max(1, s.y - 2);
  c.save();
  c.fillStyle = '#000000';
  c.fillRect(x, y, size, size);
  c.fillStyle = '#ffffff';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(no), x + size / 2, y + size / 2 + 0.5);
  c.restore();
}

/**
 * 加工指示書の図を作る。図に出る位置が 1 つもなければ null。
 * 使う位置のパネルだけを横に並べる（上衣を使うときは前・後ろの両方）。gcodes の品番が BB で始まれば帯を黒く描く
 */
export async function kakoFigure(posis: KakoPosi[], gcodes: string[]): Promise<KakoFigure | null> {
  const used = posis.map((p, i) => ({ p, no: i + 1, s: spotOf(p.posi) })).filter(u => u.s && (u.p.naiyo.trim() || u.p.img));
  if (used.length == 0) {
    return null;
  }
  const want = new Set(used.map(u => u.s!.panel));
  const panels: Panel[] = [];
  if (want.has('front') || want.has('back')) {
    panels.push('front', 'back');
  }
  if (want.has('pants')) {
    panels.push('pants');
  }
  if (want.has('belt')) {
    panels.push('belt');
  }
  const dark = gcodes.some(g => /^BB/i.test(g));
  const imgs = new Map<number, HTMLImageElement | null>();
  for (const u of used) {
    if (u.p.img) {
      imgs.set(u.no, await loadImage(u.p.img));
    }
  }
  const width = panels.reduce((a, p) => a + PANELS[p].w, 0) + PAD * (panels.length + 1);
  const height = Math.max(...panels.map(p => PANELS[p].h)) + TITLE_H + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const c = canvas.getContext('2d');
  if (!c) {
    return null;
  }
  c.scale(SCALE, SCALE);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, width, height);
  let x = PAD;
  for (const p of panels) {
    const pn = PANELS[p];
    c.save();
    c.fillStyle = '#000000';
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'left';
    c.fillText(pn.title, x, PAD + 12);
    c.translate(x, PAD + TITLE_H);
    c.strokeStyle = LINE;
    c.lineWidth = 1.4;
    if (p == 'front') {
      drawFront(c);
    } else if (p == 'back') {
      drawBack(c);
    } else if (p == 'pants') {
      drawPants(c);
    } else {
      drawBelt(c, dark);
    }
    for (const u of used.filter(v => v.s!.panel == p)) {
      const img = imgs.get(u.no);
      if (img) {
        drawImg(c, img, u.s!);
      } else {
        drawText(c, u.p.naiyo, u.s!, p == 'belt' && dark ? '#d9a531' : '#000000');
      }
      drawTag(c, u.no, u.s!, pn.w);
    }
    c.restore();
    x += pn.w + PAD;
  }
  return { url: canvas.toDataURL('image/png'), width, height };
}

/**
 * 画像ファイル（または貼り付けた画像）を、指示書に貼る大きさ（長い辺 600px まで）の JPEG の data URL にする
 */
export async function shrinkImage(file: Blob, max = 600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img) {
      throw new Error('画像を読めませんでした（JPEG・PNG などの画像を選んでください）');
    }
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * r));
    canvas.height = Math.max(1, Math.round(img.height * r));
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
