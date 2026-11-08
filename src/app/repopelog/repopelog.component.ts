import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { BunruiService } from './../services/bunrui.service';

/** 操作ログの 1 行 */
interface LogRow {
  sequ: number;
  extype: string | null;
  keycode: string | null;
  memo: string | null;
  status: string | null;
  created_by: string | null;
  created_at: string;
}

/** 一度に出す件数の上限（多すぎると画面が重くなる） */
const LIMIT = 1000;

/** 種別（extype）ごとの伝票の画面（キーの欄から伝票を開く） */
const LINKS: Record<string, string> = { '1': 'frmsales', '5': 'frminvoice' };

/**
 * 作業ログ（システム → 作業ログ）。操作ログ（tropelog。DB のトリガーで記録）を、期間・種別・伝票番号・担当者・内容で探して表示する。
 * 伝票の画面の「操作ログ」は 1 伝票分だけなので、ここでは伝票をまたいで探せるようにする
 */
@Component({
  selector: 'app-repopelog',
  templateUrl: './repopelog.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, FormsModule, DatePipe]
})
export class RepopelogComponent implements OnInit {
  private usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  bunsrv = inject(BunruiService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  from = '';
  to = '';
  extype = '';
  keycode = '';
  tcode = '';
  memo = '';
  rows: LogRow[] = [];
  searched = false;
  busy = false;
  error = '';

  constructor() {
    this.title.setTitle('作業ログ(MWSystem)');
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    this.from = this.usrsrv.formatDate(from);
    this.to = this.usrsrv.formatDate(today);
  }

  async ngOnInit() {
    try {
      await Promise.all([
        this.stfsrv.tcds.length == 0 ? this.stfsrv.getStaff() : Promise.resolve(),
        this.bunsrv.qryBunrui()
      ]);
    } catch (e) {
      console.log('error load staff/bunrui', e);
    }
    this.cdRef.detectChanges();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  /** 種別の選択肢（分類マスタ kubun = extype。無ければログにある値をそのまま） */
  get extypes(): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn['extype'] ?? []) as { value: string; viewval: string }[];
  }

  extypeName(v: string | null): string {
    if (v == null) {
      return '';
    }
    const n = this.extypes.find(e => e.value == v)?.viewval;
    return n ? v + ' ' + n : v;
  }

  staff(code: string | null): string {
    if (!code) {
      return '';
    }
    const name = this.stfsrv.getName(code);
    return name ? name + '（' + code + '）' : code;
  }

  /** キーの欄から開く伝票の画面（受注伝票・掛請求伝票のときだけ） */
  link(r: LogRow): string | null {
    const p = r.extype != null ? LINKS[r.extype] : undefined;
    return p && r.keycode ? '/' + p + '/3/' + r.keycode.trim() : null;
  }

  /** 1 日進めた日付（期間の終わりの日を含めるため） */
  private nextDay(d: string): string {
    const t = new Date(d + 'T00:00:00');
    t.setDate(t.getDate() + 1);
    return this.usrsrv.formatDate(t);
  }

  async search() {
    this.error = '';
    if (this.from && this.to && this.from > this.to) {
      this.error = '期間の開始日が終了日より後になっています';
      return;
    }
    const and: Record<string, unknown>[] = [{ id: { _eq: this.usrsrv.compid } }];
    if (this.from) {
      and.push({ created_at: { _gte: this.from + 'T00:00:00+09:00' } });
    }
    if (this.to) {
      and.push({ created_at: { _lt: this.nextDay(this.to) + 'T00:00:00+09:00' } });
    }
    if (this.extype) {
      and.push({ extype: { _eq: this.extype } });
    }
    if (this.keycode.trim()) {
      and.push({ keycode: { _eq: this.keycode.trim() } });
    }
    if (this.tcode) {
      and.push({ created_by: { _eq: this.tcode } });
    }
    if (this.memo.trim()) {
      and.push({ memo: { _ilike: '%' + this.memo.trim() + '%' } });
    }
    const Get = gql`
      query get_opelog_search($where: tropelog_bool_exp!, $limit: Int!) {
        tropelog(where: $where, order_by: {sequ: desc}, limit: $limit) {
          sequ
          extype
          keycode
          memo
          status
          created_by
          created_at
        }
      }`;
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const res = await firstValueFrom(this.apollo.query<{ tropelog: LogRow[] }>({
        query: Get,
        fetchPolicy: 'network-only',
        variables: { where: { _and: and }, limit: LIMIT + 1 }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('no data');
      }
      this.rows = res.data.tropelog;
      this.searched = true;
    } catch (e) {
      console.log('error query get_opelog_search', e);
      this.error = '操作ログを読み込めませんでした';
      this.rows = [];
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 上限を超えたか（超えたら上限までを出し、条件を絞るよう知らせる） */
  get over(): boolean {
    return this.rows.length > LIMIT;
  }

  get shown(): LogRow[] {
    return this.over ? this.rows.slice(0, LIMIT) : this.rows;
  }
}
