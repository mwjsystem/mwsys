import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DatePipe, DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../mstvendor/vends.service';
import { MembsService } from './../mstmember/membs.service';
import { RepwaitService, WaitFilter, WaitRow } from './repwait.service';

/**
 * 入荷待ち一覧（仕入関連）。発注入荷待ち（在庫種別 8）の受注明細と、割り当てた発注（入荷予定日・仕入先）を一覧にする。
 * 発注伝票で入荷日を確定すると古い受注から割り当たり、入荷（仕入）で引当に変わってこの一覧から消える。
 * 割り当ての無いものは「未割当」（次に入荷日を確定した発注か、入荷で割り当たる）
 */
@Component({
  selector: 'app-repwait',
  templateUrl: './repwait.component.html',
  styleUrls: ['./repwait.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatToolbar, MatButton, MatIcon, DatePipe, DecimalPipe]
})
export class RepwaitComponent implements AfterViewInit {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  private vensrv = inject(VendsService);
  private memsrv = inject(MembsService);
  private srv = inject(RepwaitService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  f: WaitFilter = { tcode: '', scode: '', gcode: '', unlinked: false };
  rows: WaitRow[] = [];
  busy = false;
  error = '';
  readonly today = this.usrsrv.formatDate(new Date());

  constructor() {
    this.title.setTitle('入荷待ち一覧(MWSystem)');
  }

  ngAfterViewInit(): void {
    // 倉庫・担当者・仕入先・顧客の名前は、ログインの情報（会社）が入ってから読む
    const done = () => this.cdRef.detectChanges();
    this.strsrv.getStore().then(done);
    if (this.stfsrv.tcds.length <= 1) {
      this.stfsrv.getStaff().then(done);
    }
    if (this.vensrv.vends.length == 0) {
      this.vensrv.getVendors().then(done);
    }
    if (this.memsrv.membs.length == 0) {
      this.memsrv.getMembers().then(done);
    }
    this.find();
  }

  async find() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      this.rows = await this.srv.find(this.f);
    } catch (e) {
      this.rows = [];
      this.error = '読めませんでした（' + (e as Error).message + '）';
      console.log('error repwait', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  get counts(): { all: number; linked: number; unlinked: number; suuLinked: number; suuUnlinked: number } {
    const l = this.rows.filter(r => r.hdenno != null);
    const u = this.rows.filter(r => r.hdenno == null);
    const sum = (a: WaitRow[]) => a.reduce((s, r) => s + r.suu, 0);
    return { all: this.rows.length, linked: l.length, unlinked: u.length, suuLinked: sum(l), suuUnlinked: sum(u) };
  }

  mname(mcode: string): string {
    return this.memsrv.getMcdtxt(mcode);
  }

  vname(vcode: string | null): string {
    return vcode ? (this.vensrv.getVcdtxt(vcode) || vcode) : '';
  }

  sname(scode: string | null): string {
    return this.strsrv.scds.find(s => s.value == scode)?.viewval ?? scode ?? '';
  }

  /** 割り当てた発注の入荷予定日が出荷予定日より後（出荷に間に合わない） */
  late(r: WaitRow): boolean {
    return !!r.hyday && !!r.yday && r.hyday > r.yday;
  }

  kbnName(k: string | null): string {
    return k == '0' ? '' : k == '1' ? '仮' : k == '2' ? '暫定' : '';
  }

  openJyu(r: WaitRow) {
    this.usrsrv.openMst('frmsales', String(r.denno));
  }

  openHat(r: WaitRow) {
    if (r.hdenno) {
      this.usrsrv.openMst('frmsupply', String(r.hdenno));
    }
  }
}
