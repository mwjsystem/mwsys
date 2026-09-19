import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatLegacyTableDataSource as MatTableDataSource } from '@angular/material/legacy-table';
import { MatLegacyPaginator as MatPaginator } from '@angular/material/legacy-paginator';
import { MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA, MatLegacyDialogRef as MatDialogRef, MatLegacyDialog as MatDialog, MatLegacyDialogConfig as MatDialogConfig } from "@angular/material/legacy-dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatLegacySpinner as MatSpinner } from '@angular/material/legacy-progress-spinner';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { BunruiService } from './../../services/bunrui.service';
import { McdhelpComponent } from './../mcdhelp/mcdhelp.component';
import { JdnohelpComponent } from './../jdnohelp/jdnohelp.component';

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

@Component({
  selector: 'app-ndnohelp',
  templateUrl: './ndnohelp.component.html',
  styleUrls: ['./../../help.component.scss']
})
export class NdnohelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  dataSource: MatTableDataSource<Nyusub>;
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

  constructor(public usrsrv: UserService,
    public stfsrv: StaffService,
    public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    private overlay: Overlay,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<NdnohelpComponent>,
    @Inject(MAT_DIALOG_DATA) data) { }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);

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
    let varWh: { [k: string]: any } = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
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
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        // this.subject.next(data.trjyuden);
        if (data.trnyusub.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = data.trnyusub;
          this.dataSource = new MatTableDataSource<Nyusub>(srcdata);
          this.dataSource.paginator = this.paginator;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
        // this.subject.complete();
      }, (error) => {
        console.log('error query get_nyusub', error);
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
