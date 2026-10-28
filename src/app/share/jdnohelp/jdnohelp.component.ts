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
import { MembsService } from './../../mstmember/membs.service';
import { McdhelpComponent } from './../mcdhelp/mcdhelp.component';
import { AdredaComponent } from './../adreda/adreda.component';
import { HasuraCond, HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput, MatSuffix, MatHint } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { StaffPipe } from '../../core/pipes/staff.pipe';
import { McdtxtPipe } from '../../core/pipes/mcdtxt.pipe';


interface Jyuden {
  denno: number;
  day: Date;
  yday: Date;
  sday: Date;
  uday: Date;
  nday: Date;
  mcode: string;
  scde: string;
  ncode: string;
  nadr: number;
  scode: string;
  tcode: number;
  tcode1: number;
  // jdstatus: string;
  // jdshsta: string;
  keep: string;
  cusden: string;
  okurino: string;
  pcode: string;
}

/** get_jyuden クエリの行。受注明細（1 行目）の商品コードが入れ子で付く */
interface JyudenRow extends Jyuden { trjyumeis: { gcode: string }[] }
/** get_jyuden クエリの結果 */
interface JyudenResult { trjyuden: JyudenRow[] }
@Component({
    selector: 'app-jdnohelp',
    templateUrl: './jdnohelp.component.html',
    styleUrls: ['./../../help.component.scss', './jdnohelp.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatSelect, FormsModule, MatOption, MatInput, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MatIconButton, MatIcon, MatHint, MatButton, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, StaffPipe, McdtxtPipe]
})
export class JdnohelpComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  memsrv = inject(MembsService);
  bunsrv = inject(BunruiService);
  cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private dialog = inject(MatDialog);
  private dialogRef = inject<MatDialogRef<JdnohelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  dataSource: MatTableDataSource<Jyuden>;
  subject = new Subject<Jyuden[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'day',
    'yday',
    'sday',
    'uday',
    'nday',
    'mcode',
    'nadr',
    'scode',
    'tcode',
    'keep',
    'okurino',
    'cusden',
    // 'skbn',
    // 'torikbn',
    'pcode',
    'tcode1 ',
    'del',
    'updated_at',
    'updated_by',
    'scde',
    'ncode',
    'gcode'
  ];
  fmcdfld: string = "mcode";
  ftype: string = "0";
  fmcd: string = "";
  feda: string = "";
  fdayfld: string = "day";
  fday: Date = new Date();
  ftcd: string = "";
  // mcdtxt:string="";
  fcusden: string = "";
  fjdst: string = "";
  fjsst: string = "";
  private querySub?: Subscription;

  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    this.dataSource = new MatTableDataSource<Jyuden>();
    if (data?.ftype) {
      this.ftype = data.ftype;
    }
    if (data?.mcdfld) {
      this.fmcdfld = data.mcdfld;
    }
    this.fmcd = data?.mcode;
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
    // this.observe.subscribe(value => {
    //     this.dataSource.paginator = this.paginator;
    //     this.dataSource= new MatTableDataSource<Jyuden>(value);
    //     this.overlayRef.detach();
    //     this.cdRef.detectChanges();
    // });
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

  diaBetsu(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    dialogConfig.data = {
      mcode: this.fmcd,
      // mode: this.mode,
      eda: this.feda,
      flg: true
    };
    // console.log(dialogConfig.data);
    let dialogRef = this.dialog.open(AdredaComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.feda = data;
        }
      }
    );
  }

  // set_mcdtxt(mcd:number){
  //   this.mcdtxt=this.memsrv.get_mcdtxt(mcd);
  // }
  getJyuden(): void {
    let varWh: HasuraWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.ftype == "0") {
      varWh.where._and.push({ "torikbn": { "_eq": false } });
    } else if (this.ftype == "1") {
      varWh.where._and.push({ "torikbn": { "_eq": true } });
    }

    if (this.fmcd) {
      let fldobj: HasuraCond = {};
      fldobj[this.fmcdfld] = { "_eq": this.fmcd };
      varWh.where._and.push(fldobj);
    }
    if (this.feda && this.fmcdfld == 'ncode') {
      varWh.where._and.push({ "nadr": { "_eq": this.feda } });
    }
    if (this.fday) {
      let fldobj: HasuraCond = {};
      fldobj[this.fdayfld] = { "_gt": this.usrsrv.formatDate(this.fday) };
      varWh.where._and.push(fldobj);
    }
    if (this.ftcd) {
      varWh.where._and.push({ "tcode": { "_eq": this.ftcd } });
    }

    // console.log(varWh);

    const GetTran = gql`
    query get_jyuden($where:trjyuden_bool_exp!) {
      trjyuden(where:$where, order_by:{denno: asc}) {
        denno
        day
        yday
        sday
        uday
        nday
        hday
        htime
        hcode
        ncode
        nadr
        scode
        tcode
        keep
        okurino
        cusden
        skbn
        torikbn
        mcode
        scde
        pcode
        tcode1 
        del
        updated_at
        updated_by
        trjyumeis(where:{line:{_eq:1}}){ 
          gcode
        }
      }
    }`;
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<JyudenResult>({
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
        const result = data as JyudenResult;
        let srcdata: Jyuden[] = [];
        if (result.trjyuden.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          result.trjyuden.forEach(element => {
            let { trjyumeis, ...rest } = element;
            // console.log(element.denno, trjyumeis);
            let gcd = { gcode: trjyumeis[0].gcode };
            srcdata.push({ ...rest, ...gcd });
          });
          this.dataSource = new MatTableDataSource<Jyuden>(srcdata);
          this.dataSource.paginator = this.paginator() ?? null;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
        // this.subject.complete();
      }, (error) => {
        console.log('error query get_jyuden', error);
        this.overlayRef.detach();
      });
  }
  selDno(selected: Jyuden) {
    // console.log("select",selected);
    // this.vcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    // this.vcds=[];
    this.dialogRef.close();
  }
}
