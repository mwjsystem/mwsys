import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatButton } from '@angular/material/button';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';

/** 操作ログを表示する伝票。extype は msbunrui（kubun = extype）の値、table は memo の「項目=」の列名を項目名にするときの表名 */
export interface OpelogParam {
  extype: string;
  keycode: string;
  title: string;
  table?: string;
}

/** 操作ログの 1 行 */
interface OpelogRow { sequ: number; memo: string | null; created_by: string | null; created_at: string }

/**
 * 伝票の操作ログ（tropelog）を新しい順に表示するダイアログ。
 * 記録は DB のトリガーで行う（受注伝票: extype = '1'、掛請求伝票: extype = '5'）。
 */
@Component({
    selector: 'app-opelog',
    templateUrl: './opelog.component.html',
    styleUrls: ['./../../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatButton, DatePipe]
})
export class OpelogComponent implements OnInit {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private apollo = inject(Apollo);
  private cdRef = inject(ChangeDetectorRef);
  private dialogRef = inject<MatDialogRef<OpelogComponent>>(MatDialogRef);
  data = inject<OpelogParam>(MAT_DIALOG_DATA);

  rows: OpelogRow[] = [];
  loading = true;
  displayedColumns = ['created_at', 'created_by', 'memo'];

  async ngOnInit() {
    const GetLog = gql`
      query get_opelog_key($id: smallint!, $typ: String!, $kcd: String!) {
        tropelog(where: {id: {_eq: $id}, extype: {_eq: $typ}, keycode: {_eq: $kcd}}, order_by: {sequ: desc}) {
          sequ
          memo
          created_by
          created_at
        }
      }`;
    try {
      if (this.stfsrv.tcds.length == 0) {
        await this.stfsrv.getStaff();
      }
      const { data } = await firstValueFrom(this.apollo.query<{ tropelog: OpelogRow[] }>({
        query: GetLog,
        fetchPolicy: 'network-only',
        variables: { id: this.usrsrv.compid, typ: this.data.extype, kcd: this.data.keycode }
      }));
      this.rows = (data as { tropelog: OpelogRow[] }).tropelog;
    } catch (error) {
      this.usrsrv.toastErr('データベースエラー', '操作ログを読み込めませんでした');
      console.log('error query get_opelog_key', error);
    }
    this.loading = false;
    this.cdRef.detectChanges();
  }

  /** memo の「項目=列名,列名」を項目名に置き換える */
  memo(text: string | null): string {
    const table = this.data.table;
    if (!text || !table) {
      return text ?? '';
    }
    return text.replace(/項目=([A-Za-z0-9_,]+)/, (_, cols: string) =>
      '項目=' + cols.split(',').map(c => this.usrsrv.getColtxt(table, c) || c).join('、'));
  }

  staff(code: string | null): string {
    if (!code) {
      return '';
    }
    const name = this.stfsrv.getName(code);
    return name ? name + '（' + code + '）' : code;
  }

  close() {
    this.dialogRef.close();
  }
}
