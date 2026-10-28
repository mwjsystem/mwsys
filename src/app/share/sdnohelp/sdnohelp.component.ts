import { Component, OnInit, OnDestroy, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject, Subscription } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { BunruiService } from './../../services/bunrui.service';
import { VendsService } from './../../mstvendor/vends.service';
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';
import { HdnohelpComponent } from './../hdnohelp/hdnohelp.component';
import { HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput, MatSuffix, MatHint } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { StaffPipe } from '../../core/pipes/staff.pipe';
import { VcdtxtPipe } from '../../core/pipes/vcdtxt.pipe';

interface Siiden {
  denno: number;
  inday: Date;
  vcode: string;
  hdenno?: number; // get_siiden では取得しない
  scode: string;
  tcode: number;
  // del: boolean;
  updated_at: Date;
  updated_by: string;
  gcode: string;
}

/** get_siiden クエリの行。仕入明細（1 行目）の商品コードが入れ子で付く */
interface SiidenRow extends Omit<Siiden, 'gcode'> { trsiimeis: { gcode: string }[] }
/** get_siiden クエリの結果 */
interface SiidenResult { trsiiden: SiidenRow[] }
@Component({
    selector: 'app-sdnohelp',
    templateUrl: './sdnohelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatSelect, FormsModule, MatOption, MatInput, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MatIconButton, MatIcon, MatHint, MatButton, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, DatePipe, StaffPipe, VcdtxtPipe]
})
export class SdnohelpComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  vensrv = inject(VendsService);
  bunsrv = inject(BunruiService);
  cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private dialog = inject(MatDialog);
  private dialogRef = inject<MatDialogRef<SdnohelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<Siiden>;
  subject = new Subject<Siiden[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'inday',
    'vcode',
    // 'hdenno',
    'scode',
    'tcode',
    'updated_at',
    'updated_by',
    'gcode'
  ];

  fvcd: string = "";
  fday: Date = new Date();
  ftcd: string = "";
  fsdno!: number;
  fhdno!: number;
  private querySub?: Subscription;

  constructor() {
    this.dataSource = new MatTableDataSource<Siiden>();
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.overlayRef.dispose();
  }

  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          console.log(data);
          this.fvcd = data.code;
          // this.set_mcdtxt(this.fmcd);
        }
      }
    );
  }
  hdnoHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(HdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.fhdno = data.denno;
          // this.set_mcdtxt(this.fmcd);
        }
      }
    );
  }
  get_siiden(): void {
    let varWh: HasuraWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.fvcd) {
      varWh.where._and.push({ "vcode": { "_eq": this.fvcd } });
    }
    if (this.fday) {
      varWh.where._and.push({ "inday": { "_gt": this.fday } });
    }
    if (this.ftcd) {
      varWh.where._and.push({ "tcode": { "_eq": this.ftcd } });
    }
    if (this.fsdno > 0) {
      varWh.where._and.push({ "denno": { "_eq": this.fsdno } });
    }
    if (this.fhdno > 0) {
      varWh.where._and.push({ "trsiimeis": { "sdenno": { "_eq": this.fhdno } } });
    }
    // console.log(this.fhdst,varWh);

    const GetTran = gql`
    query get_siiden($where:trsiiden_bool_exp!) {
      trsiiden(where:$where, order_by:{denno: asc}) {
        denno
        inday
        scode
        vcode
        tcode 
        updated_at
        updated_by
        trsiimeis(where:{line:{_eq:1}}){ 
          gcode
        }
      }
    }`;
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<SiidenResult>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        if (!data) {
          return;
        }
        const result = data as SiidenResult;
        if (result.trsiiden.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata: Siiden[] = [];
          result.trsiiden.forEach(element => {
            let { trsiimeis, ...rest } = element;
            let gcd = { gcode: trsiimeis[0].gcode };
            srcdata.push({ ...rest, ...gcd });
          });
          this.dataSource = new MatTableDataSource<Siiden>(srcdata);
          this.dataSource.paginator = this.paginator() ?? null;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_siiden', error);
        this.overlayRef.detach();
      });
  }
  sel_dno(selected: Siiden) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }



}
