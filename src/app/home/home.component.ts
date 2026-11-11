import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { MatCard, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { VendsService } from './../mstvendor/vends.service';
import { MisyuRow, MisyuService } from './../frmnyukin/misyu.service';
import { NyuMember, NyukinService } from './../frmnyukin/nyukin.service';

/** 入荷予定が決まった発注明細 */
interface YoteiRow { denno: number; line: number; gcode: string; gtext: string | null; yday: string; ydaykbn: string | null; hatzn: number; jdenno: number | null; vcode: string; tcode: string | null }
/** 入荷した仕入明細 */
interface NyukaRow { denno: number; line: number; gcode: string; gtext: string | null; suu: number; inday: string; hdenno: number | null; jdenno: number | null; vcode: string; scode: string | null }

const ymd = (d: Date): string => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/**
 * ホーム（ダッシュボード）。
 *   ・未入金のフォロー: 自分の担当（営業・内勤）で、支払予定日を過ぎたもの・まだ対応していないもの（未入金管理）
 *   ・入荷予定が決まった: 入荷予定日が確定・仮確定の、これから 2 週間の発注明細（受発注なら受注伝票も）
 *   ・入荷した: この 7 日に入荷（仕入）した商品（受発注なら受注伝票も）
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterLink, FormsModule, DecimalPipe, MatCard, MatCardTitle, MatCardContent, MatIcon, MatButton]
})
export class HomeComponent implements OnInit {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private vensrv = inject(VendsService);
  private missrv = inject(MisyuService);
  private nyusrv = inject(NyukinService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly today = ymd(new Date());

  // 未入金
  misyu: MisyuRow[] = [];
  members = new Map<string, NyuMember>();
  misyuOver = 0;
  misyuNone = 0;
  misyuBusy = true;
  misyuError = '';

  // 入荷予定
  yotei: YoteiRow[] = [];
  yoteiBusy = true;
  yoteiError = '';
  /** 受注に結び付くものだけ */
  yoteiJyuOnly = false;

  // 入荷した
  nyuka: NyukaRow[] = [];
  nyukaBusy = true;
  nyukaError = '';
  nyukaJyuOnly = false;

  constructor() {
    this.title.setTitle('ホーム(MWSystem)');
  }

  ngOnInit(): void {
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
    this.vensrv.getVendors().then(() => this.cdRef.detectChanges());
    this.loadMisyu();
    this.loadYotei();
    this.loadNyuka();
  }

  vname(v: string): string {
    return this.vensrv.getVcdtxt(v);
  }

  name(m: string): string {
    return this.nyusrv.memberName(this.members.get(m));
  }

  get yoteiShown(): YoteiRow[] {
    return this.yoteiJyuOnly ? this.yotei.filter(r => r.jdenno) : this.yotei;
  }

  get nyukaShown(): NyukaRow[] {
    return this.nyukaJyuOnly ? this.nyuka.filter(r => r.jdenno) : this.nyuka;
  }

  /** 未入金のフォロー（自分の担当。この 1 年の入金予定日） */
  async loadMisyu() {
    try {
      const from = new Date();
      from.setFullYear(from.getFullYear() - 1);
      const r = await this.missrv.list('all', ymd(from), this.today);
      this.members = r.members;
      const mine = r.rows.filter(e => this.missrv.isMine(e) && this.missrv.isOpen(e));
      this.misyuOver = mine.filter(e => this.missrv.isOverdue(e, this.today)).length;
      this.misyuNone = mine.filter(e => !e.last).length;
      this.misyu = mine
        .filter(e => this.missrv.isOverdue(e, this.today) || !e.last)
        .sort((a, b) => (Number(this.missrv.isOverdue(b, this.today)) - Number(this.missrv.isOverdue(a, this.today))) || b.late - a.late)
        .slice(0, 12);
    } catch (e) {
      this.misyuError = '読めませんでした（' + (e as Error).message + '）';
      console.log('error home misyu', e);
    }
    this.misyuBusy = false;
    this.cdRef.detectChanges();
  }

  /** 入荷予定が決まった（確定・仮確定、今日から 2 週間） */
  async loadYotei() {
    try {
      const to = new Date();
      to.setDate(to.getDate() + 14);
      const Get = gql`
        query dash_yotei($id: smallint!, $from: date!, $to: date!) {
          vhatzn(where: {id: {_eq: $id}, hatzn: {_gt: 0}, yday: {_gte: $from, _lte: $to}, ydaykbn: {_in: ["0", "1"]}}, order_by: [{yday: asc}, {denno: asc}, {line: asc}], limit: 300) {
            denno line gcode gtext yday ydaykbn hatzn jdenno
          }
        }`;
      const res = await firstValueFrom(this.apollo.query<{ vhatzn: Omit<YoteiRow, 'vcode' | 'tcode'>[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, from: this.today, to: ymd(to) }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('no data');
      }
      const heads = await this.hatdens([...new Set(res.data.vhatzn.map(r => r.denno))]);
      this.yotei = res.data.vhatzn.map(r => ({
        ...r, yday: String(r.yday).slice(0, 10), hatzn: Number(r.hatzn), jdenno: Number(r.jdenno) || null,
        vcode: heads.get(r.denno)?.vcode ?? '', tcode: heads.get(r.denno)?.tcode ?? null
      }));
    } catch (e) {
      this.yoteiError = '読めませんでした（' + (e as Error).message + '）';
      console.log('error home yotei', e);
    }
    this.yoteiBusy = false;
    this.cdRef.detectChanges();
  }

  private async hatdens(dennos: number[]): Promise<Map<number, { vcode: string; tcode: string | null }>> {
    const map = new Map<number, { vcode: string; tcode: string | null }>();
    if (dennos.length == 0) {
      return map;
    }
    const Get = gql`query dash_hatden($id: smallint!, $d: [Int!]!) { trhatden(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno vcode tcode } }`;
    const res = await firstValueFrom(this.apollo.query<{ trhatden: { denno: number; vcode: string; tcode: string | null }[] }>({
      query: Get, variables: { id: this.usrsrv.compid, d: dennos }
    }));
    res.data?.trhatden.forEach(h => map.set(h.denno, { vcode: String(h.vcode ?? ''), tcode: h.tcode }));
    return map;
  }

  /** 入荷した（この 7 日の仕入） */
  async loadNyuka() {
    try {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const Get = gql`
        query dash_nyuka($id: smallint!, $from: date!) {
          trsiimei(where: {id: {_eq: $id}, inday: {_gte: $from}}, order_by: [{inday: desc}, {denno: desc}, {line: asc}], limit: 300) {
            denno line gcode suu inday hdenno hline
            msgood { gtext }
            trsiiden { vcode scode }
          }
        }`;
      type Row = { denno: number; line: number; gcode: string; suu: number; inday: string; hdenno: number | null; hline: number | null; msgood: { gtext: string | null } | null; trsiiden: { vcode: string; scode: string | null } | null };
      const res = await firstValueFrom(this.apollo.query<{ trsiimei: Row[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, from: ymd(from) }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('no data');
      }
      // 発注明細から受注伝票番号をとる（受発注）
      const hd = [...new Set(res.data.trsiimei.map(r => Number(r.hdenno)).filter(n => n > 0))];
      const jmap = new Map<string, number>();
      if (hd.length) {
        const GetH = gql`query dash_hmei($id: smallint!, $d: [Int!]!) { trhatmei(where: {id: {_eq: $id}, denno: {_in: $d}, jdenno: {_is_null: false}}) { denno line jdenno } }`;
        const h = await firstValueFrom(this.apollo.query<{ trhatmei: { denno: number; line: number; jdenno: number }[] }>({ query: GetH, variables: { id: this.usrsrv.compid, d: hd } }));
        h.data?.trhatmei.forEach(e => jmap.set(e.denno + ':' + e.line, e.jdenno));
      }
      this.nyuka = res.data.trsiimei.map(r => ({
        denno: r.denno, line: r.line, gcode: r.gcode, gtext: r.msgood?.gtext ?? null, suu: Number(r.suu), inday: String(r.inday).slice(0, 10),
        hdenno: r.hdenno, jdenno: (r.hdenno && jmap.get(r.hdenno + ':' + r.hline)) || null,
        vcode: String(r.trsiiden?.vcode ?? ''), scode: r.trsiiden?.scode ?? null
      }));
    } catch (e) {
      this.nyukaError = '読めませんでした（' + (e as Error).message + '）';
      console.log('error home nyuka', e);
    }
    this.nyukaBusy = false;
    this.cdRef.detectChanges();
  }

  isOver(r: MisyuRow): boolean {
    return this.missrv.isOverdue(r, this.today);
  }

  open(func: string, dno: number | null) {
    if (dno) {
      this.usrsrv.openMst(func, String(dno));
    }
  }
}
