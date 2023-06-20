import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { BunruiService } from './../../services/bunrui.service';
import { MembsService } from './../../mstmember/membs.service';
import { McdhelpComponent } from './../mcdhelp/mcdhelp.component';
import { AdredaComponent } from './../adreda/adreda.component';


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

@Component({
  selector: 'app-jdnohelp',
  templateUrl: './jdnohelp.component.html',
  styleUrls: ['./../../help.component.scss']
})
export class JdnohelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
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

  constructor(public usrsrv: UserService,
    public stfsrv: StaffService,
    public memsrv: MembsService,
    public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    private overlay: Overlay,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<JdnohelpComponent>,
    @Inject(MAT_DIALOG_DATA) data) {
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
    let varWh: { [k: string]: any } = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.ftype == "0") {
      varWh.where._and.push({ "torikbn": { "_eq": false } });
    } else if (this.ftype == "1") {
      varWh.where._and.push({ "torikbn": { "_eq": true } });
    }

    if (this.fmcd) {
      let fldobj: { [k: string]: any } = {};
      fldobj[this.fmcdfld] = { "_eq": this.fmcd };
      varWh.where._and.push(fldobj);
    }
    if (this.feda && this.fmcdfld == 'ncode') {
      varWh.where._and.push({ "nadr": { "_eq": this.feda } });
    }
    if (this.fday) {
      let fldobj: { [k: string]: any } = {};
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
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        // this.subject.next(data.trjyuden);
        let srcdata = [];
        if (data.trjyuden.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          data.trjyuden.forEach(element => {
            let { trjyumeis, ...rest } = element;
            console.log(element.denno, trjyumeis);
            let gcd = { gcode: trjyumeis[0].gcode };
            srcdata.push({ ...rest, ...gcd });
          });
          this.dataSource = new MatTableDataSource<Jyuden>(srcdata);
          this.dataSource.paginator = this.paginator;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
        // this.subject.complete();
      }, (error) => {
        console.log('error query get_jyuden', error);
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
