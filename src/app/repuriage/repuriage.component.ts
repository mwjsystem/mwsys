import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { COL_NICHI, COL_PREV, Mode, Node, PersItem, RepuriageService, UriReport, Val, monthCol } from './repuriage.service';
import { UserService } from './../services/user.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import { DecimalPipe, DatePipe, PercentPipe } from '@angular/common';

/** 個人集計の行（実績・昨年・上昇額・上昇率） */
interface PersLine { label: string; cells: (number | null)[]; total: number | null; pct?: boolean }
interface PersBlock { item: PersItem; lines: PersLine[] }

/**
 * 売上報告（現行の「2026年売上報告.xlsm」の置き換え）。売上報告・個人集計・累計値の 3 つのタブ。
 * 担当→大分類→部門（または大分類→部門、部門）の切り口で見る。行の ▶ で下の階層を開く。
 */
@Component({
  selector: 'app-repuriage',
  templateUrl: './repuriage.component.html',
  styleUrls: ['./repuriage.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIcon, MatFormField, MatLabel, MatInput, MatSuffix, MatSelect, MatOption, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, MatTabGroup, MatTab, FormsModule, DecimalPipe, DatePipe, PercentPipe]
})
export class RepuriageComponent implements OnInit {
  private srv = inject(RepuriageService);
  private usrsrv = inject(UserService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  day: Date = new Date();
  /** 表示した対象日 */
  shownDay?: Date;
  mode: Mode = 'tanto';
  report?: UriReport;
  root?: Node;
  busy = false;
  error = '';
  /** 開いている行 */
  private open = new Set<string>();
  /** 列: 当月日割・1〜12 月・前年 12 月 */
  columns: { key: string; label: string }[] = [];
  persMonths: { label: string; ym: (r: UriReport) => { j: string; l: string } }[] = [];
  persBlocks: PersBlock[] = [];
  years: number[] = [];

  constructor() {
    this.title.setTitle('売上報告(MWSystem)');
  }

  ngOnInit(): void {
    this.columns = [{ key: COL_NICHI, label: '当月日割' }];
    for (let i = 1; i <= 12; i++) {
      this.columns.push({ key: monthCol(i), label: i + '月' });
    }
    this.columns.push({ key: COL_PREV, label: '前年12月' });
    this.show();
  }

  async show() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      this.report = await this.srv.load(new Date(this.day));
      this.shownDay = new Date(this.day);
      this.build();
    } catch (e) {
      this.report = undefined;
      this.error = '集計できませんでした：' + (e as Error).message;
      console.log('error repuriage', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 切り口を変えた・読み込んだとき */
  build() {
    if (!this.report) {
      return;
    }
    this.root = this.srv.tree(this.report, this.mode);
    this.open.clear();
    this.buildPers(this.report);
    this.years = [];
    for (let y = this.report.year; y >= this.report.year - 16; y--) {
      this.years.push(y);
    }
  }

  private buildPers(r: UriReport) {
    const ymOf = (y: number, m: number) => y + '-' + ('0' + m).slice(-2);
    const cols: { j: string; l: string }[] = [{ j: ymOf(r.year - 1, 12), l: ymOf(r.year - 2, 12) }];
    for (let i = 1; i <= 12; i++) {
      cols.push({ j: ymOf(r.year, i), l: ymOf(r.year - 1, i) });
    }
    this.persBlocks = r.persItems.map(item => {
      const get = (rows: UriReport['persJ'], ym: string) => rows.filter(e => e.seq == item.seq && e.ym == ym).reduce((s, e) => s + Number(e.kingaku), 0);
      const jis = cols.map(c => get(r.persJ, c.j));
      const lines: PersLine[] = [{ label: '実績', cells: jis, total: jis.reduce((a, b) => a + b, 0) }];
      if (item.kind != 'F') {
        const sak = cols.map(c => get(r.persL, c.l));
        const upTo = r.month + 1; // 前年 12 月 + 1 月〜当月
        const sum = (a: number[]) => a.slice(0, upTo).reduce((x, y) => x + y, 0);
        lines.push({ label: '昨年', cells: sak, total: sum(sak) });
        lines.push({ label: '上昇額', cells: jis.map((v, i) => v - sak[i]), total: sum(jis) - sum(sak) });
        lines.push({ label: '上昇率', cells: jis.map((v, i) => sak[i] ? v / sak[i] : null), total: sum(sak) ? sum(jis) / sum(sak) : null, pct: true });
        lines[0].total = sum(jis);
      }
      return { item, lines };
    });
  }

  get persCols(): string[] {
    const ret = ['前年12月'];
    for (let i = 1; i <= 12; i++) {
      ret.push(i + '月');
    }
    return ret;
  }

  /** 表に出す行（開いている行の子を含む） */
  get rows(): Node[] {
    const ret: Node[] = [];
    const walk = (n: Node) => {
      ret.push(n);
      if (this.open.has(n.key)) {
        n.children.forEach(walk);
      }
    };
    this.root?.children.forEach(walk);
    return ret;
  }

  isOpen(n: Node): boolean {
    return this.open.has(n.key);
  }

  toggle(n: Node) {
    if (this.open.has(n.key)) {
      this.open.delete(n.key);
    } else {
      this.open.add(n.key);
    }
  }

  /** すべて開く・閉じる */
  expand(all: boolean) {
    this.open.clear();
    if (all) {
      const walk = (n: Node) => {
        if (n.children.length > 0) {
          this.open.add(n.key);
          n.children.forEach(walk);
        }
      };
      this.root?.children.forEach(walk);
    }
  }

  val(n: Node, col: string): Val {
    return n.vals[col] ?? { jis: 0, sak: 0, ara: 0 };
  }

  ratio(v: Val): number | null {
    return v.sak ? v.jis / v.sak : null;
  }

  cum(n: Node): Val {
    return this.srv.cum(this.report!, n);
  }

  /** 年間目標（担当者の行だけ） */
  target(n: Node): number | null {
    return n.level == 0 && this.mode == 'tanto' ? this.report!.targets[n.tanto ?? ''] ?? null : null;
  }

  get totalTarget(): number {
    return this.mode == 'tanto' ? Object.values(this.report?.targets ?? {}).reduce((a, b) => a + b, 0) : 0;
  }

  /** 年間目標の日割額（目標 × 累積稼働日 / 年度の稼働日数） */
  daily(t: number | null): number | null {
    return t == null || !this.report?.yearBiz ? null : Math.round(t * this.report.yearDone / this.report.yearBiz);
  }

  /** 年別の表の金額 */
  ym(y: number, m: number): number {
    return this.report?.yearly[y + '-' + ('0' + m).slice(-2)] ?? 0;
  }

  yearTotal(y: number): number {
    let s = 0;
    for (let m = 1; m <= 12; m++) {
      s += this.ym(y, m);
    }
    return s;
  }

  get months(): number[] {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
}
