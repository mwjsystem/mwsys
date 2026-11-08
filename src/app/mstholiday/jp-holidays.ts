/**
 * 国民の祝日（日本）の計算。「国民の祝日に関する法律」の今の決まり（2020 年以降）で、その年の祝日・振替休日・国民の休日を出す。
 * 春分の日・秋分の日は計算式（1980〜2099 年に使える式）。正式には前の年の 2 月に官報で決まるので、念のため確かめること。
 * 2020・2021 年は東京オリンピック・パラリンピックの特例（海の日・スポーツの日・山の日の移動）を入れてある。
 */
export const JP_HOLIDAY_MIN = 2020;
export const JP_HOLIDAY_MAX = 2099;

const ymd = (y: number, m: number, d: number) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

/** その月の第 n 月曜日 */
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}

/** 年の祝日（日付 → 名前）。範囲外の年は空 */
export function jpHolidays(y: number): Map<string, string> {
  const h = new Map<string, string>();
  if (y < JP_HOLIDAY_MIN || y > JP_HOLIDAY_MAX) {
    return h;
  }
  const add = (m: number, d: number, name: string) => h.set(ymd(y, m, d), name);
  const k = Math.floor((y - 1980) / 4);
  add(1, 1, '元日');
  add(1, nthMonday(y, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  add(2, 23, '天皇誕生日');
  add(3, Math.floor(20.8431 + 0.242194 * (y - 1980)) - k, '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  if (y == 2020) {
    add(7, 23, '海の日');
    add(7, 24, 'スポーツの日');
    add(8, 10, '山の日');
  } else if (y == 2021) {
    add(7, 22, '海の日');
    add(7, 23, 'スポーツの日');
    add(8, 8, '山の日');
  } else {
    add(7, nthMonday(y, 7, 3), '海の日');
    add(8, 11, '山の日');
    add(10, nthMonday(y, 10, 2), 'スポーツの日');
  }
  add(9, nthMonday(y, 9, 3), '敬老の日');
  add(9, Math.floor(23.2488 + 0.242194 * (y - 1980)) - k, '秋分の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  const iso = (t: Date) => ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
  const shift = (s: string, n: number) => {
    const t = new Date(s + 'T00:00:00');
    t.setDate(t.getDate() + n);
    return iso(t);
  };
  // 国民の休日：前の日と次の日が祝日にはさまれた、祝日でない日（日曜は除く）
  for (const s of [...h.keys()]) {
    const mid = shift(s, 1);
    if (!h.has(mid) && h.has(shift(s, 2)) && new Date(mid + 'T00:00:00').getDay() != 0) {
      h.set(mid, '国民の休日');
    }
  }
  // 振替休日：祝日が日曜日のとき、その後のいちばん近い祝日でない日
  for (const s of [...h.keys()].sort()) {
    if (new Date(s + 'T00:00:00').getDay() == 0) {
      let t = shift(s, 1);
      while (h.has(t)) {
        t = shift(t, 1);
      }
      if (t.startsWith(String(y))) {
        h.set(t, '振替休日');
      }
    }
  }
  return new Map([...h].sort(([a], [b]) => a.localeCompare(b)));
}
