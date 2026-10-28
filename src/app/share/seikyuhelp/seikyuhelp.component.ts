import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { McdhelpComponent } from './../mcdhelp/mcdhelp.component';
import { HasuraCond, HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput, MatSuffix, MatHint } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { DecimalPipe } from '@angular/common';
import { McdtxtPipe } from '../../core/pipes/mcdtxt.pipe';

/** 請求(月次締め)の 1 行 */
interface Seikyu {
  denno: number;
  mcode: string;
  sday: Date;
  zenkai: number;
  nmon: number;
  tmon: number;
  taxmon: number;
  tax: number;
  seikyu: number;
  bcode: string;
}

/** get_seikyu クエリの結果 */
interface SeikyuResult { trseikyu: Seikyu[] }

@Component({
    selector: 'app-seikyuhelp',
    templateUrl: './seikyuhelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, FormsModule, MatInput, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MatIconButton, MatIcon, MatHint, MatButton, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, DecimalPipe, McdtxtPipe]
})
export class SeikyuhelpComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private dialog = inject(MatDialog);
  private dialogRef = inject<MatDialogRef<SeikyuhelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<Seikyu>;
  displayedColumns = [
    'denno',
    'mcode',
    'sday',
    'zenkai',
    'taxmon',
    'tax',
    'seikyu',
    'bcode'
  ];

  fdenno: string = "";
  fmcd: string = "";
  fday: Date = new Date();
  private querySub?: Subscription;

  constructor() {
    this.dataSource = new MatTableDataSource<Seikyu>();
  }

  ngOnInit(): void {
    this.fday.setMonth(this.fday.getMonth() - 1);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.overlayRef.dispose();
  }

  mcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.fmcd = data.mcode;
        }
      }
    );
  }

  getSeikyu(): void {
    // 取消済（論理削除）の請求伝票は検索対象外
    let varWh: HasuraWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }, { "del": { "_eq": false } }] } };
    if (this.fdenno) {
      varWh.where._and.push({ "denno": { "_eq": +this.fdenno } });
    }
    if (this.fmcd) {
      varWh.where._and.push({ "mcode": { "_eq": this.fmcd } });
    }
    if (this.fday) {
      varWh.where._and.push({ "sday": { "_gt": this.usrsrv.formatDate(this.fday) } });
    }

    const GetTran = gql`
    query get_seikyu($where:trseikyu_bool_exp!) {
      trseikyu(where:$where, order_by:{sday: asc}) {
        denno
        mcode
        sday
        zenkai
        nmon
        tmon
        taxmon
        tax
        seikyu
        bcode
      }
    }`;
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<SeikyuResult>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        if (!data) {
          return;
        }
        const result = data as SeikyuResult;
        if (result.trseikyu.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          this.dataSource = new MatTableDataSource<Seikyu>(result.trseikyu);
          this.dataSource.paginator = this.paginator() ?? null;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_seikyu', error);
        this.overlayRef.detach();
      });
  }

  selDno(selected: Seikyu) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
