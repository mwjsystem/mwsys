import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { jpHolidays, JP_HOLIDAY_MIN, JP_HOLIDAY_MAX } from './jp-holidays';
import { daysOfYear, fillCalendarBook, isPaid, PAID_NAME, workdays } from './calendar-excel';
import * as FileSaver from 'file-saver';

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
  /** 休日マスタに登録してある名前（日付 → 名前） */
  names = new Map<string, string>();
  /** 画面での名前（日付 → 名前。一覧の入力欄で変えられる） */
  edits = new Map<string, string>();
  /** カレンダーを押して入れる日の名前（国民の祝日の日は祝日の名前） */
  newName = '休業日';
  /** 変更モードか（開いたときは照会モード。「変更」を押すと編集できる） */
  editing = false;
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
    return this.added.length > 0 || this.removed.length > 0 || this.renamed.length > 0;
  }
  /** 登録済みの休日で、名前を変えた日 */
  get renamed(): string[] {
    return [...this.current].filter(d => this.saved.has(d) && (this.edits.get(d) ?? '') !== (this.names.get(d) ?? '')).sort();
  }
  /** 一覧の名前の欄を変えたとき */
  setName(date: string, value: string) {
    if (!this.editing) {
      return;
    }
    this.edits.set(date, value);
    this.message = '';
  }
  /** 新しく休日にする日の名前の初期値（国民の祝日は祝日の名前） */
  private defName(date: string): string {
    return this.jp.get(date) ?? (this.newName.trim() || '休業日');
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

  /** 日付だけ（一覧用。名前は入力欄に出す） */
  dateLabel(date: string): string {
    const t = new Date(date + 'T00:00:00');
    return (t.getMonth() + 1) + '/' + t.getDate() + '（' + WEEK[t.getDay()] + '）';
  }

  label(date: string): string {
    const t = new Date(date + 'T00:00:00');
    const name = this.edits.get(date) || this.names.get(date) || this.jp.get(date);
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
          name
        }
      }`;
    this.busy = true;
    try {
      const res = await firstValueFrom(this.apollo.query<{ msholiday: { holiday: string; name: string | null }[] }>({
        query: Get,
        fetchPolicy: 'network-only',
        variables: { id: this.usrsrv.compid, from: this.year + '-01-01', to: this.year + '-12-31' }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('no data');
      }
      this.saved = new Set(res.data.msholiday.map(e => String(e.holiday).slice(0, 10)));
      this.names = new Map(res.data.msholiday.map(e => [String(e.holiday).slice(0, 10), e.name ?? '']));
      this.current = new Set(this.saved);
      this.edits = new Map(this.names);
    } catch (e) {
      console.log('error query get_msholiday_year', e);
      this.error = '休日マスタを読み込めませんでした';
      this.saved = new Set();
      this.current = new Set();
      this.names = new Map();
      this.edits = new Map();
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  move(n: number) {
    if (this.dirty && !confirm('保存していない変更があります。捨てて別の年を表示しますか？')) {
      return;
    }
    this.current = new Set(this.saved); // 変更を捨てる（load で確認を出さないよう）
    this.edits = new Map(this.names);
    this.year += n;
    this.load();
  }

  /** 変更モードにする */
  startEdit() {
    this.editing = true;
    this.message = '';
    this.error = '';
  }

  /** 照会モードに戻す（保存していない変更は捨てる） */
  endEdit() {
    if (this.dirty && !confirm('保存していない変更があります。捨てて照会に戻りますか？')) {
      return;
    }
    this.undo();
    this.editing = false;
    this.error = '';
  }

  toggle(day: Day) {
    if (this.busy || !this.editing) {
      return;
    }
    if (this.current.has(day.date)) {
      this.current.delete(day.date);
      this.edits.delete(day.date);
    } else {
      this.current.add(day.date);
      this.edits.set(day.date, this.names.get(day.date) ?? this.defName(day.date));
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
      // 有給奨励日（休日として数える。橙色）
      paid: h && isPaid(this.edits.get(day.date)),
      // 国民の祝日なのに休日になっていない日（土日以外）
      jpmiss: !h && this.jp.has(day.date) && day.w != 0 && day.w != 6,
      today: day.date == this.usrsrv.formatDate(new Date()),
      // 照会モード（押しても切り替わらない）
      ro: !this.editing
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
    if (!this.editing) {
      return;
    }
    let n = 0;
    for (const d of this.jp.keys()) {
      const w = new Date(d + 'T00:00:00').getDay();
      if (w != 0 && w != 6 && !this.current.has(d)) {
        this.current.add(d);
        this.edits.set(d, this.names.get(d) ?? this.defName(d));
        n++;
      }
    }
    this.message = n > 0
      ? '国民の祝日を ' + n + ' 日入れました（まだ保存していません。確かめてから「保存」を押してください）'
      : '国民の祝日（土日以外）はすべて入っています';
  }

  /** 月の出勤日数・休日数（画面の今の内容で数える） */
  monthCount(m: number): { work: number; off: number } {
    const work = workdays(this.year, m, this.current);
    return { work, off: new Date(this.year, m, 0).getDate() - work };
  }

  /** 年間の出勤日数・休日数（休日は土日と、土日以外の休日の内訳も） */
  /** 名前の候補（入力欄の候補。有給奨励日もここから選べる） */
  readonly nameOptions = ['休業日', '年末年始', '夏季休業', PAID_NAME, '棚卸し'];

  isPaidName(name: string | undefined): boolean {
    return isPaid(name);
  }

  /** この年の有給奨励日の日数（土日以外） */
  get paidCount(): number {
    return [...this.current].filter(d => d.startsWith(this.year + '-') && isPaid(this.edits.get(d))).length;
  }

  get yearCount(): { work: number; off: number; weekend: number; other: number } {
    let work = 0;
    for (let m = 1; m <= 12; m++) {
      work += workdays(this.year, m, this.current);
    }
    const off = daysOfYear(this.year) - work;
    const other = [...this.current].filter(d => {
      const w = new Date(d + 'T00:00:00').getDay();
      return d.startsWith(this.year + '-') && w != 0 && w != 6;
    }).length;
    return { work, off, weekend: off - other, other };
  }

  /** 現行の「最新カレンダー.xlsx」と同じ並びの Excel を出す（画面の今の内容で。翌年 1 月は休日マスタから読む） */
  async excel() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const ny = this.year + 1;
      const Get = gql`
        query get_msholiday_next($id: smallint!, $from: date!, $to: date!) {
          msholiday(where: {id: {_eq: $id}, holiday: {_gte: $from, _lte: $to}}) { holiday name }
        }`;
      const res = await firstValueFrom(this.apollo.query<{ msholiday: { holiday: string; name: string | null }[] }>({
        query: Get,
        fetchPolicy: 'network-only',
        variables: { id: this.usrsrv.compid, from: ny + '-01-01', to: ny + '-01-31' }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('no data');
      }
      const next = res.data.msholiday.map(e => ({ d: String(e.holiday).slice(0, 10), name: e.name ?? '' }));
      const holidays = new Set([...this.current, ...next.map(e => e.d)]);
      const names = new Map([...this.edits, ...next.map(e => [e.d, e.name] as [string, string])]);
      const jp = new Map([...this.jp, ...[...jpHolidays(ny)].filter(([d]) => d.startsWith(ny + '-01-'))]);
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      fillCalendarBook(wb, { year: this.year, holidays, names, jp });
      const buf = await excelBuffer(wb);
      const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      FileSaver.saveAs(new Blob([buf], { type }), this.year + 'カレンダー.xlsx');
      if (this.dirty) {
        this.message = 'Excel は画面の内容（保存していない変更を含む）で作りました';
      }
    } catch (e) {
      console.log('error calendar excel', e);
      this.error = 'Excel を作成できませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  undo() {
    this.current = new Set(this.saved);
    this.edits = new Map(this.names);
    this.message = '';
  }

  async save() {
    const add = this.added;
    const del = this.removed;
    const ren = this.renamed;
    if (add.length == 0 && del.length == 0 && ren.length == 0) {
      return;
    }
    // 名前（name）は空にできない列
    const nameOf = (d: string) => (this.edits.get(d) ?? '').trim();
    const blank = [...add, ...ren].filter(d => nameOf(d) == '');
    if (blank.length > 0) {
      this.error = '名前が空の休日があります：' + blank.map(d => this.label(d)).join('、');
      return;
    }
    // 名前を変えた日だけ更新する（変えていなければ更新の権限が無くても保存できるよう、更新の部分を入れない）
    const Save = ren.length > 0 ? gql`
      mutation save_msholiday($objs: [msholiday_insert_input!]!, $id: smallint!, $del: [date!]!, $upd: [msholiday_updates!]!) {
        delete_msholiday(where: {id: {_eq: $id}, holiday: {_in: $del}}) { affected_rows }
        insert_msholiday(objects: $objs) { affected_rows }
        update_msholiday_many(updates: $upd) { affected_rows }
      }` : gql`
      mutation save_msholiday($objs: [msholiday_insert_input!]!, $id: smallint!, $del: [date!]!) {
        delete_msholiday(where: {id: {_eq: $id}, holiday: {_in: $del}}) { affected_rows }
        insert_msholiday(objects: $objs) { affected_rows }
      }`;
    const id = this.usrsrv.compid;
    this.busy = true;
    this.error = '';
    try {
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Save,
        variables: {
          objs: add.map(d => ({ id, holiday: d, name: nameOf(d) })),
          id,
          del,
          ...(ren.length > 0 ? { upd: ren.map(d => ({ where: { id: { _eq: id }, holiday: { _eq: d } }, _set: { name: nameOf(d) } })) } : {})
        }
      }));
      if (res.error) {
        throw res.error;
      }
      this.saved = new Set(this.current);
      [...add, ...ren].forEach(d => this.names.set(d, nameOf(d)));
      del.forEach(d => this.names.delete(d));
      this.edits = new Map(this.names);
      this.editing = false; // 保存したら照会に戻す
      // ほかの画面（出荷予定日の計算など）の休日も今の内容にする
      const others = this.usrsrv.holidays.filter(h => !String(h).startsWith(this.year + '-'));
      this.usrsrv.holidays = [...others, ...this.saved];
      this.message = '保存しました（休日の追加 ' + add.length + ' 日・削除 ' + del.length + ' 日・名前の変更 ' + ren.length + ' 日）';
    } catch (e) {
      console.log('error mutation save_msholiday', e);
      this.error = '休日マスタに保存できませんでした（権限が無い場合は、Hasura の msholiday の insert・delete・update の権限を確認してください）'
        + (e instanceof Error && e.message ? '：' + e.message : '');
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
