import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { jpHolidays, JP_HOLIDAY_MIN, JP_HOLIDAY_MAX } from './jp-holidays';

/** カレンダーの 1 日（null は月の始まりの前の空き） */
interface Day { date: string; d: number; w: number }
interface Month { m: number; days: (Day | null)[] }

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 稼働日カレンダ（システム → 稼働日カレンダ）。休日マスタ（msholiday）を年ごとのカレンダーで編集する。
 * 土日はもともと休み（出荷予定日などの計算で飛ばす）。ここでは土日以外の休み（祝日・年末年始・夏季休業など）を入れる。
 * 日付を押すと休日／稼働日が切り替わり、「保存」で休日マスタに書く（追加と削除を 1 回でまとめて書く）
 */
@Component({
  selector: 'app-mstholiday',
  templateUrl: './mstholiday.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss', './mstholiday.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIconButton, MatIcon]
})
export class MstholidayComponent implements OnInit {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly week = WEEK;
  year = new Date().getFullYear();
  months: Month[] = [];
  /** DB にある休日（この年） */
  saved = new Set<string>();
  /** 画面での休日（この年） */
  current = new Set<string>();
  busy = false;
  error = '';
  message = '';

  constructor() {
    this.title.setTitle('稼働日カレンダ(MWSystem)');
  }

  ngOnInit() {
    this.load();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  private ymd(y: number, m: number, d: number): string {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  private build() {
    this.months = [];
    for (let m = 1; m <= 12; m++) {
      const first = new Date(this.year, m - 1, 1).getDay();
      const last = new Date(this.year, m, 0).getDate();
      const days: (Day | null)[] = Array(first).fill(null);
      for (let d = 1; d <= last; d++) {
        days.push({ date: this.ymd(this.year, m, d), d, w: (first + d - 1) % 7 });
      }
      this.months.push({ m, days });
    }
  }

  get dirty(): boolean {
    return this.added.length > 0 || this.removed.length > 0;
  }
  get added(): string[] {
    return [...this.current].filter(d => !this.saved.has(d)).sort();
  }
  get removed(): string[] {
    return [...this.saved].filter(d => !this.current.has(d)).sort();
  }
  /** この年の休日（土日以外も含めて登録してあるもの）の一覧 */
  get list(): string[] {
    return [...this.current].sort();
  }

  label(date: string): string {
    const t = new Date(date + 'T00:00:00');
    const name = this.jp.get(date);
    return (t.getMonth() + 1) + '/' + t.getDate() + '（' + WEEK[t.getDay()] + '）' + (name ? ' ' + name : '');
  }

  async load() {
    if (this.dirty && !confirm('保存していない変更があります。捨てて読み直しますか？')) {
      return;
    }
    this.error = '';
    this.message = '';
    this.build();
    const Get = gql`
      query get_msholiday_year($id: smallint!, $from: date!, $to: date!) {
        msholiday(where: {id: {_eq: $id}, holiday: {_gte: $from, _lte: $to}}) {
          holiday
        }
      }`;
    this.busy = true;
    try {
      const res = await firstValueFrom(this.apollo.query<{ msholiday: { holiday: string }[] }>({
        query: Get,
        fetchPolicy: 'network-only',
        variables: { id: this.usrsrv.compid, from: this.year + '-01-01', to: this.year + '-12-31' }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('no data');
      }
      this.saved = new Set(res.data.msholiday.map(e => String(e.holiday).slice(0, 10)));
      this.current = new Set(this.saved);
    } catch (e) {
      console.log('error query get_msholiday_year', e);
      this.error = '休日マスタを読み込めませんでした';
      this.saved = new Set();
      this.current = new Set();
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  move(n: number) {
    if (this.dirty && !confirm('保存していない変更があります。捨てて別の年を表示しますか？')) {
      return;
    }
    this.current = new Set(this.saved); // 変更を捨てる（load で確認を出さないよう）
    this.year += n;
    this.load();
  }

  toggle(day: Day) {
    if (this.busy) {
      return;
    }
    if (this.current.has(day.date)) {
      this.current.delete(day.date);
    } else {
      this.current.add(day.date);
    }
    this.message = '';
  }

  /** 日付の見た目（休日・土日・変更した日） */
  cls(day: Day): Record<string, boolean> {
    const h = this.current.has(day.date);
    return {
      hol: h,
      sun: day.w == 0,
      sat: day.w == 6,
      chg: h != this.saved.has(day.date),
      // 国民の祝日なのに休日になっていない日（土日以外）
      jpmiss: !h && this.jp.has(day.date) && day.w != 0 && day.w != 6,
      today: day.date == this.usrsrv.formatDate(new Date())
    };
  }

  /** この年の国民の祝日（日付 → 名前） */
  get jp(): Map<string, string> {
    if (this.jpYear !== this.year) {
      this.jpCache = jpHolidays(this.year);
      this.jpYear = this.year;
    }
    return this.jpCache;
  }
  private jpCache = new Map<string, string>();
  private jpYear = 0;

  get jpSupported(): boolean {
    return this.year >= JP_HOLIDAY_MIN && this.year <= JP_HOLIDAY_MAX;
  }

  /**
   * 国民の祝日（振替休日・国民の休日を含む）を休日に入れる。土日の祝日はもともと休みなので入れない。
   * 入れるだけで、すでに入っている休日（年末年始など）は消さない。保存は「保存」ボタンで
   */
  addJp() {
    let n = 0;
    for (const d of this.jp.keys()) {
      const w = new Date(d + 'T00:00:00').getDay();
      if (w != 0 && w != 6 && !this.current.has(d)) {
        this.current.add(d);
        n++;
      }
    }
    this.message = n > 0
      ? '国民の祝日を ' + n + ' 日入れました（まだ保存していません。確かめてから「保存」を押してください）'
      : '国民の祝日（土日以外）はすべて入っています';
  }

  undo() {
    this.current = new Set(this.saved);
    this.message = '';
  }

  async save() {
    const add = this.added;
    const del = this.removed;
    if (add.length == 0 && del.length == 0) {
      return;
    }
    const Save = gql`
      mutation save_msholiday($objs: [msholiday_insert_input!]!, $id: smallint!, $del: [date!]!) {
        delete_msholiday(where: {id: {_eq: $id}, holiday: {_in: $del}}) { affected_rows }
        insert_msholiday(objects: $objs) { affected_rows }
      }`;
    this.busy = true;
    this.error = '';
    try {
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Save,
        variables: { objs: add.map(d => ({ id: this.usrsrv.compid, holiday: d })), id: this.usrsrv.compid, del }
      }));
      if (res.error) {
        throw res.error;
      }
      this.saved = new Set(this.current);
      // ほかの画面（出荷予定日の計算など）の休日も今の内容にする
      const others = this.usrsrv.holidays.filter(h => !String(h).startsWith(this.year + '-'));
      this.usrsrv.holidays = [...others, ...this.saved];
      this.message = '保存しました（休日の追加 ' + add.length + ' 日・削除 ' + del.length + ' 日）';
    } catch (e) {
      console.log('error mutation save_msholiday', e);
      this.error = '休日マスタに保存できませんでした（権限が無い場合は、Hasura の msholiday の insert・delete の権限を確認してください）';
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
