import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { ClosedayService } from './../services/closeday.service';
import { NyuMember, NyuOrder, NyukinService, PTYPE } from './nyukin.service';
import { money, parseCsv, readText } from './nyu-csv';

/** 代引の明細の 1 行 */
interface DaiRow {
  okurino: string;
  /** 振込日（入金日にする） */
  day: string;
  /** 発送日 */
  sday: string;
  amount: number;
  fee: number;
  order: NyuOrder | null;
  /** 照合の結果 */
  state: 'ok' | 'diff' | 'paid' | 'none' | 'done';
  ref: string;
  on: boolean;
}

/**
 * 佐川代引消込（売上入金 → 佐川代引消込）。佐川の e-コレクトの明細の CSV（お問い合せNo.・代引金・振込日付）を読み、
 * 送り状番号が同じ受注に入金伝票（入金方法: 佐川代引銀、入金日: 振込日）を作る。
 * 金額が入金残と違うもの・入金済のもの・送り状番号が見つからないものは印を付けずに知らせる。
 * 備考に「佐川代引 お問い合せNo.」を入れ、二重に取り込まない
 */
@Component({
  selector: 'app-nyudaibiki',
  templateUrl: './nyudaibiki.component.html',
  styleUrls: ['./nyubulk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, MatTooltip, DecimalPipe]
})
export class NyudaibikiComponent {
  usrsrv = inject(UserService);
  private closesrv = inject(ClosedayService);
  private nyusrv = inject(NyukinService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  rows: DaiRow[] = [];
  members = new Map<string, NyuMember>();
  fileName = '';
  busy = false;
  message = '';
  error = '';

  readonly STATE: Record<DaiRow['state'], string> = {
    ok: '一致', diff: '金額が違う', paid: '入金済', none: '送り状番号が見つからない', done: '取込済'
  };

  constructor() {
    this.title.setTitle('佐川代引消込(MWSystem)');
    this.closesrv.load();
  }

  name(m: string): string {
    return this.nyusrv.memberName(this.members.get(m));
  }

  count(s: DaiRow['state']): number {
    return this.rows.filter(r => r.state == s).length;
  }

  get selected(): DaiRow[] {
    return this.rows.filter(r => r.on && r.order && r.state != 'done');
  }

  get selectedSum(): number {
    return this.selected.reduce((a, r) => a + r.amount, 0);
  }

  async load(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.fileName = file.name;
    this.busy = true;
    this.error = '';
    this.message = '';
    this.rows = [];
    this.cdRef.detectChanges();
    try {
      const csv = parseCsv(await readText(file));
      const head = csv[0] ?? [];
      const col = (name: string) => head.findIndex(h => h.replace(/\s/g, '').startsWith(name));
      const ci = {
        y: col('振込日付（年）'), m: col('振込日付（月）'), d: col('振込日付（日）'), sday: col('発送日'),
        no: col('お問い合せNo'), amount: col('代引金'), fee: col('代引手数料')
      };
      if (ci.no < 0 || ci.amount < 0 || ci.y < 0) {
        throw new Error('佐川の e-コレクトの明細ではありません（お問い合せNo.・代引金・振込日付の列がありません）');
      }
      const rows: DaiRow[] = [];
      for (const c of csv.slice(1)) {
        const no = String(c[ci.no] ?? '').replace(/\D/g, '');
        const amount = money(c[ci.amount]);
        if (!no || !Number.isFinite(amount)) {
          continue;
        }
        const day = String(c[ci.y]).trim() + '-' + String(c[ci.m]).trim().padStart(2, '0') + '-' + String(c[ci.d]).trim().padStart(2, '0');
        const sd = String(c[ci.sday] ?? '').trim();
        rows.push({
          okurino: no, day, sday: sd.length == 8 ? sd.slice(0, 4) + '-' + sd.slice(4, 6) + '-' + sd.slice(6) : sd,
          amount, fee: money(c[ci.fee]) || 0, order: null, state: 'none', ref: '佐川代引 ' + no, on: false
        });
      }
      if (rows.length == 0) {
        throw new Error('代引の行がありません');
      }
      // 送り状番号で受注を探す（同じ番号が複数なら、入金残のあるもの）
      const nos = [...new Set(rows.map(r => r.okurino))];
      const orders: NyuOrder[] = [];
      for (let i = 0; i < nos.length; i += 500) {
        orders.push(...await this.nyusrv.orders([{ okurino: { _in: nos.slice(i, i + 500) } }], 5000));
      }
      const done = await this.nyusrv.memosExist(rows.map(r => r.ref));
      for (const r of rows) {
        const hits = orders.filter(o => String(o.okurino ?? '').replace(/\D/g, '') == r.okurino);
        const o = hits.find(h => h.nyuzan > 0) ?? hits[0] ?? null;
        r.order = o;
        if (done.has(r.ref)) {
          r.state = 'done';
        } else if (!o) {
          r.state = 'none';
        } else if (o.nyuzan <= 0) {
          r.state = 'paid';
        } else if (o.nyuzan != r.amount) {
          r.state = 'diff';
        } else {
          r.state = 'ok';
          r.on = true;
        }
      }
      this.members = await this.nyusrv.members(orders.map(o => o.scde || o.mcode));
      this.rows = rows;
      this.message = rows.length + ' 件を読みました（一致 ' + this.count('ok') + '・金額が違う ' + this.count('diff') + '・入金済 ' + this.count('paid')
        + '・見つからない ' + this.count('none') + '・取込済 ' + this.count('done') + '）。一致したものに印を付けています';
    } catch (e) {
      this.error = '読めませんでした：' + (e as Error).message;
      console.log('error nyudaibiki', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 印を付けた行に入金伝票を作る（代引金を入金額にする） */
  async create() {
    const rows = this.selected;
    if (rows.length == 0) {
      return;
    }
    const closed = rows.filter(r => this.closesrv.isClosed(r.day));
    if (closed.length) {
      this.error = '締め日（' + this.closesrv.closeday + '）以前の振込日の行があります';
      return;
    }
    if (!confirm(rows.length + ' 件・合計 ' + this.selectedSum.toLocaleString() + ' 円の入金伝票を作ります（佐川代引銀）。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const slips = rows.map(r => {
        const o = r.order!;
        const s = this.nyusrv.simple(0, r.day, o.scde || o.mcode, PTYPE.SAGAWA, r.amount, r.ref, { jdenno: o.denno });
        s.lines[0].mmemo = '発送 ' + r.sday;
        return s;
      });
      const dennos = await this.nyusrv.createMany(slips);
      rows.forEach(r => {
        r.state = 'done';
        r.on = false;
      });
      this.message = dennos.length + ' 件の入金伝票を作りました（' + dennos[0] + '～' + dennos[dennos.length - 1] + '）';
      this.usrsrv.toastSuc(this.message);
    } catch (e) {
      this.error = '入金伝票を作れませんでした：' + (e as Error).message;
      console.log('error nyudaibiki create', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
