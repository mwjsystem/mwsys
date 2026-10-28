import { Component, OnInit, OnDestroy, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject, Subscription } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { BunruiService } from './../../services/bunrui.service';
import { McdhelpComponent } from './../mcdhelp/mcdhelp.component';
import { JdnohelpComponent } from './../jdnohelp/jdnohelp.component';
import { HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput, MatSuffix, MatHint } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { StaffPipe } from '../../core/pipes/staff.pipe';
import { McdtxtPipe } from '../../core/pipes/mcdtxt.pipe';

interface Nyusub {
  denno: number;
  kubun: number;
  day: Date;
  mcode: string;
  code: string;
  tcode: string;
  updated_at: Date;
  updated_by: string
  jdenno: number;
  idenno: number;
  nmoney: number;
  smoney: number;
  tmoney: number;
}

/** get_nyuden クエリの結果 */
interface NyusubResult { trnyusub: Nyusub[] }

@Component({
    selector: 'app-ndnohelp',
    templateUrl: './ndnohelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatSelect, FormsModule, MatOption, MatInput, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MatIconButton, MatIcon, MatHint, MatButton, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, StaffPipe, McdtxtPipe]
})
export class NdnohelpComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  bunsrv = inject(BunruiService);
  cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private dialog = inject(MatDialog);
  private dialogRef = inject<MatDialogRef<NdnohelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  dataSource = new MatTableDataSource<Nyusub>([]);
  subject = new Subject<Nyusub[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'kubun',
    'day',
    'mcode',
    'code',
    'tcode',
    // 'biko',
    'updated_at',
    'updated_by',
    'jdenno',
    'idenno',
    'nmoney',
    'smoney',
    'tmoney'
  ];
  ftype: string = "0";
  fmcd: string = "";
  fday: Date = new Date();
  ftcd: string = "";
  fjdno: number = 0;
  private querySub?: Subscription;

  constructor() {
    const data = inject(MAT_DIALOG_DATA);
    if (data?.ftype) {
      this.ftype = data.ftype;
    }
    if (data?.mcode) {
      this.fmcd = data.mcode;
    }
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
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
          // this.set_mcdtxt(this.fmcd);
        }
      }
    );
  }

  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      mcdfld: 'scde',
      mcode: this.fmcd,
      ftype: '0'
    };
    let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.fjdno = data.denno;
        }
      }
    );

  }

  get_nyuden(): void {
    let varWh: HasuraWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.ftype == "0") {
      varWh.where._and.push({ "kubun": { "_eq": 0 } });
    } else if (this.ftype == "1") {
      varWh.where._and.push({ "kubun": { "_eq": 1 } });
    }

    if (this.fmcd) {
      varWh.where._and.push({ "mcode": { "_eq": this.fmcd } });
    }
    if (this.fday) {
      varWh.where._and.push({ "day": { "_gt": this.fday } });
    }
    if (this.ftcd) {
      varWh.where._and.push({ "tcode": { "_eq": this.ftcd } });
    }
    if (this.fjdno > 0) {
      varWh.where._and.push({ "jdenno": { "_eq": this.fjdno } });
    }
    const GetTran = gql`
    query get_nyuden($where:trnyusub_bool_exp!) {
      trnyusub(where: $where, order_by:{denno: asc}) {
        denno
        kubun
        day
        mcode
        tcode
        code
        biko
        updated_at
        updated_by
        jdenno
        idenno
        nmoney
        smoney
        tmoney
      }
    }`;
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<NyusubResult>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        // this.subject.next(data.trjyuden);
        if (!data) {
          return;
        }
        const result = data as NyusubResult;
        if (result.trnyusub.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = result.trnyusub;
          this.dataSource = new MatTableDataSource<Nyusub>(srcdata);
          this.dataSource.paginator = this.paginator() ?? null;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
        // this.subject.complete();
      }, (error) => {
        console.log('error query get_nyusub', error);
        this.overlayRef.detach();
      });




  }

  sel_dno(selected: Nyusub) {
    // console.log("select",selected);
    // this.vcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    // this.vcds=[];
    this.dialogRef.close();
  }
}
