import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

/**
 * 日付欄に手で打った日付を読む（No.11）。ブラウザ標準の読み取り（Date.parse）では
 * 「20261125」は読めず、「11/25」は 2001 年になってしまうので、通販Pro と同じ打ち方を読めるようにする。
 *   20261125 / 2026/11/25 / 2026-11-25 / 2026.11.25 → その日
 *   261125（年は 2000 年代）
 *   11/25 / 1125 → 今年の 11 月 25 日
 *   25 → 今月の 25 日
 * 全角の数字・記号も読む。読めないものは標準の読み取りに任せる。表示は今までどおり（ja-JP の 2026/11/25）
 */
@Injectable()
export class JpDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value == 'string') {
      const s = value.trim()
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[／－．ー]/g, '/')
        .replace(/[-.]/g, '/');
      if (s == '') {
        return null;
      }
      const d = jpDate(s, new Date());
      if (d) {
        return d;
      }
    }
    return super.parse(value, parseFormat);
  }
}

/** 打った文字列を日付にする。読めない・ありえない日付は null */
export function jpDate(s: string, today: Date): Date | null {
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  let d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})(\d{2})(\d{2})$/)) || (r = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) {
    y = +r[1]; m = +r[2]; d = +r[3];
  } else if ((r = s.match(/^(\d{2})(\d{2})(\d{2})$/))) {
    y = 2000 + +r[1]; m = +r[2]; d = +r[3];
  } else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})$/)) || (r = s.match(/^(\d{2})(\d{2})$/))) {
    m = +r[1]; d = +r[2];
  } else if ((r = s.match(/^(\d{1,2})$/))) {
    d = +r[1];
  } else {
    return null;
  }
  const dt = new Date(y, m - 1, d);
  // 2/30 などは翌月に繰り越されるので、読めなかったことにする
  if (dt.getFullYear() != y || dt.getMonth() != m - 1 || dt.getDate() != d) {
    return null;
  }
  return dt;
}
