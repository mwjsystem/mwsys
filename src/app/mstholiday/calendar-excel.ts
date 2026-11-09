import type { Workbook, Worksheet, Borders } from 'exceljs';

/**
 * 稼働日カレンダの Excel（現行の「最新カレンダー.xlsx」と同じ並び）。
 * 1 枚に 12 か月（横 3 か月 × 縦 4 段）、各月の上に出勤日数、下に色の説明・年間の出勤日数と休日数・翌年 1 月、右に休日の一覧。
 * 日付の色：赤 = 日曜・祝日（振替休日・国民の休日を含む）、青 = 土曜・当社指定休業日（休日マスタにある祝日以外の日）、
 * 橙 = 有給奨励日（休日マスタの名前が「有給奨励日」の日。非稼働日として出勤日数に入れない）
 */

const EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const RED = 'FFCC0000';
const BLUE = 'FF0066CC';
const GRAY = 'FFE5E5E5';
const ORANGE = 'FFFF9900';

/** 有給奨励日の名前（休日マスタの名前がこれを含む日は有給奨励日。休日（非稼働日）として数え、橙色にする） */
export const PAID_NAME = '有給奨励日';
export const isPaid = (name: string | null | undefined) => !!name && name.includes(PAID_NAME);

const ymd = (y: number, m: number, d: number) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

/** 休日か（土日、または休日マスタにある日） */
export function isOff(date: string, holidays: Set<string>): boolean {
  const w = new Date(date + 'T00:00:00').getDay();
  return w == 0 || w == 6 || holidays.has(date);
}

/** その月の出勤日数（土日と休日マスタの日を除いた日数） */
export function workdays(y: number, m: number, holidays: Set<string>): number {
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    if (!isOff(ymd(y, m, d), holidays)) {
      n++;
    }
  }
  return n;
}

/** 年の日数 */
export function daysOfYear(y: number): number {
  return (new Date(y + 1, 0, 1).getTime() - new Date(y, 0, 1).getTime()) / 86400000;
}

/** 列番号 → 列名（1 = A、27 = AA） */
const col = (n: number): string => (n > 26 ? col(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));

export interface CalendarData {
  year: number;
  /** 休日マスタの日（この年と翌年 1 月） */
  holidays: Set<string>;
  /** 休日の名前（日付 → 名前） */
  names: Map<string, string>;
  /** 国民の祝日（この年と翌年 1 月。日付 → 名前）。赤字にする日 */
  jp: Map<string, string>;
}

/** 1 か月の表（見出し・曜日・日付）。c0 = 日曜の列番号、r0 = 見出しの行 */
function monthBlock(ws: Worksheet, d: CalendarData, y: number, m: number, c0: number, r0: number, head: (number | string)) {
  const thin: Partial<Borders> = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
  // 見出し：出勤日数（または年）・月・英語の月名
  ws.mergeCells(r0, c0, r0, c0 + 1);
  ws.mergeCells(r0, c0 + 2, r0, c0 + 4);
  ws.mergeCells(r0, c0 + 5, r0, c0 + 6);
  const h1 = ws.getCell(r0, c0);
  h1.value = head;
  if (typeof head == 'number') {
    h1.numFmt = '"出勤日数"0';
  }
  h1.font = { size: 9 };
  h1.alignment = { horizontal: 'left', vertical: 'bottom' };
  const h2 = ws.getCell(r0, c0 + 2);
  h2.value = m;
  h2.font = { size: 20, bold: true };
  h2.alignment = { horizontal: 'center', vertical: 'bottom' };
  const h3 = ws.getCell(r0, c0 + 5);
  h3.value = EN[m - 1];
  h3.font = { size: 10, italic: true };
  h3.alignment = { horizontal: 'right', vertical: 'bottom' };
  // 曜日
  for (let w = 0; w < 7; w++) {
    const c = ws.getCell(r0 + 1, c0 + w);
    c.value = WEEK[w];
    c.alignment = { horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: w == 0 ? RED : w == 6 ? BLUE : GRAY } };
    c.font = { bold: true, size: 10, color: { argb: w == 0 || w == 6 ? 'FFFFFFFF' : 'FF333333' } };
  }
  // 日付
  const first = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const k = first + day - 1;
    const w = k % 7;
    const date = ymd(y, m, day);
    const c = ws.getCell(r0 + 2 + Math.floor(k / 7), c0 + w);
    c.value = day;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    const hol = d.holidays.has(date);
    const red = w == 0 || (hol && d.jp.has(date));
    const paid = !red && hol && isPaid(d.names.get(date));
    const blue = !red && !paid && (w == 6 || hol);
    c.font = { size: 12, bold: red || blue || paid, color: { argb: red ? RED : paid ? ORANGE : blue ? BLUE : 'FF333333' } };
    c.border = thin;
  }
}

/** 稼働日カレンダの Excel を作る */
export function fillCalendarBook(wb: Workbook, d: CalendarData): void {
  const y = d.year;
  const ws = wb.addWorksheet(String(y), {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      horizontalCentered: true, verticalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    }
  });
  for (let c = 1; c <= 25; c++) {
    ws.getColumn(c).width = c == 1 ? 2 : 6.25;
  }
  ws.getColumn(26).width = 3;
  ws.getColumn(27).width = 14;
  ws.getColumn(28).width = 18;

  // 表題
  ws.mergeCells('B1:X1');
  const t = ws.getCell('B1');
  t.value = y + ' CALENDAR';
  t.font = { size: 24, bold: true };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  // 12 か月（横 3 × 縦 4）。見出しの行は 2・11・19・28（現行と同じ）
  const rows = [2, 11, 19, 28];
  const cols = [2, 10, 18];
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const n = workdays(y, m, d.holidays);
    total += n;
    monthBlock(ws, d, y, m, cols[(m - 1) % 3], rows[Math.floor((m - 1) / 3)], n);
  }

  // 翌年 1 月（右下）
  monthBlock(ws, d, y + 1, 1, 18, 37, y + 1);

  // 色の説明
  const legend: [string, string, string][] = [
    ['赤字', RED, '日曜日・祝日・振替休日'],
    ['青字', BLUE, '土曜日・当社指定休業日'],
    ['橙字', ORANGE, '有給奨励日']
  ];
  legend.forEach(([a, color, b], k) => {
    const c1 = ws.getCell(38 + k, 2);
    c1.value = a;
    c1.font = { bold: true, color: { argb: color } };
    ws.getCell(38 + k, 3).value = b;
  });

  // 年間の出勤日数・休日数
  ws.mergeCells('B41:E41');
  ws.mergeCells('B42:E42');
  const a1 = ws.getCell('B41');
  a1.value = total;
  a1.numFmt = '"年間出勤日数 "0"日"';
  a1.font = { size: 12, bold: true };
  const a2 = ws.getCell('B42');
  a2.value = daysOfYear(y) - total;
  a2.numFmt = '"年間休日 "0"日"';
  a2.font = { size: 12, bold: true };

  // 休日の一覧（土日以外。休日マスタの日と名前）
  const hc = ws.getCell(2, 27);
  hc.value = '休日（土日以外）';
  hc.font = { bold: true };
  const list = [...d.holidays].filter(s => s.startsWith(y + '-')).sort();
  list.forEach((s, k) => {
    const [yy, mm, dd] = s.split('-').map(Number);
    const c1 = ws.getCell(3 + k, 27);
    c1.value = new Date(Date.UTC(yy, mm - 1, dd));
    c1.numFmt = 'm/d(aaa)';
    c1.alignment = { horizontal: 'left' };
    ws.getCell(3 + k, 28).value = d.names.get(s) || d.jp.get(s) || '';
  });

  ws.pageSetup.printArea = 'A1:' + col(28) + Math.max(44, 3 + list.length);
}
