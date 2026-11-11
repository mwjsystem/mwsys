import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { BunruiService } from './../services/bunrui.service';
import { ClosedayService } from './../services/closeday.service';
import { NyuMember, NyukinService, nyuState } from './nyukin.service';

/** 一覧の 1 行（受注か請求伝票） */
interface BulkRow {
  on: boolean;
  /** 受注伝票番号（都度）か請求伝票番号（掛売） */
  denno: number;
  mcode: string;
  /** 受注: 売上日、請求: 締め日 */
  day: string | null;
  /** 受注: 入金予定日 */
  nday: string | null;
  pcode: string | null;
  total: number;
  zan: number;
  /** 入金する額（初期値は残） */
  money: number;
}

/**
 * 一括入金（売上入金 → 一括入金）。入金残のある受注（都度）か請求伝票（掛売）を条件で探し、
 * 印を付けたものに入金伝票をまとめて作る（現行の一括入金処理）。入金額は行ごとに直せる
 */
@Component({
  selector: 'app-nyubulk',
  templateUrl: './nyubulk.component.html',
  styleUrls: ['./nyubulk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, DecimalPipe]
})
export class NyubulkComponent {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  bunsrv = inject(BunruiService);
  private closesrv = inject(ClosedayService);
  private nyusrv = inject(NyukinService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  /** 0 = 都度（受注）、1 = 掛売（請求伝票） */
  kubun: 0 | 1 = 0;
  /** 都度の日付の条件: nday = 入金予定日、uday = 売上日 */
  dayKind: 'nday' | 'uday' = 'nday';
  from = '';
  to = this.usrsrv.formatDate(new Date());
  pcode = '';
  mcode = '';
  zanFrom = 1;
  zanTo = 99999999;
  /** 入金情報 */
  day = this.usrsrv.formatDate(new Date());
  ptype = '3';
  memo = '';
  rows: BulkRow[] = [];
  members = new Map<string, NyuMember>();
  loaded = false;
  busy = false;
  message = '';
  error = '';

  constructor() {
    this.title.setTitle('一括入金(MWSystem)');
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges()).catch(e => console.log('error bunrui', e));
    this.closesrv.load();
  }

  kbn(k: string): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn[k] ?? []) as { value: string; viewval: string }[];
  }

  kbnName(k: string, v: string | null): string {
    return v ? this.kbn(k).find(e => e.value == v)?.viewval ?? v : '';
  }

  name(m: string): string {
    return this.nyusrv.memberName(this.members.get(m));
  }

  state(r: BulkRow): string {
    return nyuState(r.total, r.zan);
  }

  get checked(): BulkRow[] {
    return this.rows.filter(r => r.on && Number(r.money) != 0);
  }

  get checkedSum(): number {
    return this.checked.reduce((a, r) => a + Number(r.money), 0);
  }

  setAll(on: boolean) {
    this.rows.forEach(r => r.on = on);
  }

  async search() {
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const zan = { _gte: Number(this.zanFrom) || 1, _lte: Number(this.zanTo) || 99999999 };
      if (this.kubun == 0) {
        const w: object[] = [{ nyuzan: zan }, { _or: [{ torikbn: { _is_null: true } }, { torikbn: { _eq: false } }] }];
        if (this.from) {
          w.push({ [this.dayKind]: { _gte: this.from } });
        }
        if (this.to) {
          w.push({ [this.dayKind]: { _lte: this.to } });
        }
        if (this.pcode) {
          w.push({ pcode: { _eq: this.pcode } });
        }
        if (this.mcode.trim()) {
          w.push({ scde: { _eq: this.mcode.trim() } });
        }
        const list = await this.nyusrv.orders(w);
        this.rows = list.map(o => ({ on: true, denno: o.denno, mcode: o.scde || o.mcode, day: o.uday, nday: o.nday, pcode: o.pcode, total: o.total, zan: o.nyuzan, money: o.nyuzan }));
      } else {
        const w: object[] = [{ zan }];
        if (this.from) {
          w.push({ sday: { _gte: this.from } });
        }
        if (this.to) {
          w.push({ sday: { _lte: this.to } });
        }
        if (this.mcode.trim()) {
          w.push({ mcode: { _eq: this.mcode.trim() } });
        }
        const list = await this.nyusrv.invoices(w);
        this.rows = list.map(s => ({ on: true, denno: s.denno, mcode: s.mcode, day: s.sday, nday: null, pcode: null, total: s.seikyu, zan: s.zan, money: s.zan }));
      }
      this.members = await this.nyusrv.members(this.rows.map(r => r.mcode));
      this.loaded = true;
      if (this.rows.length >= 3000) {
        this.message = '3000 件までを出しています。条件を絞ってください';
      }
    } catch (e) {
      this.error = '探せませんでした：' + (e as Error).message;
      console.log('error nyubulk', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 印を付けた行に、入金伝票を 1 枚ずつ作る */
  async create() {
    const rows = this.checked;
    if (rows.length == 0) {
      return;
    }
    if (!this.day || !this.ptype) {
      this.error = '入金日と入金方法を選んでください';
      return;
    }
    if (this.closesrv.isClosed(this.day)) {
      this.error = '入金日が締め日（' + this.closesrv.closeday + '）以前です';
      return;
    }
    const over = rows.filter(r => Number(r.money) > r.zan).length;
    if (!confirm(rows.length + ' 件・合計 ' + this.checkedSum.toLocaleString() + ' 円の入金伝票を作ります（入金日 ' + this.day + '・'
      + this.kbnName('ptype', this.ptype) + '）' + (over ? '\n残より多い（過入金になる）行が ' + over + ' 件あります。' : '') + '\nよろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const slips = rows.map(r => this.nyusrv.simple(this.kubun, this.day, r.mcode, this.ptype, Number(r.money), this.memo || '一括入金',
        this.kubun == 0 ? { jdenno: r.denno } : { idenno: r.denno }));
      const dennos = await this.nyusrv.createMany(slips);
      this.message = dennos.length + ' 件の入金伝票を作りました（' + dennos[0] + '～' + dennos[dennos.length - 1] + '）';
      this.usrsrv.toastSuc(this.message);
      await this.search();
      this.message = dennos.length + ' 件の入金伝票を作りました（' + dennos[0] + '～' + dennos[dennos.length - 1] + '）';
    } catch (e) {
      this.error = '入金伝票を作れませんでした：' + (e as Error).message;
      console.log('error nyubulk create', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  open(r: BulkRow) {
    this.usrsrv.openMst(this.kubun == 0 ? 'frmsales' : 'frminvoice', String(r.denno));
  }
}
