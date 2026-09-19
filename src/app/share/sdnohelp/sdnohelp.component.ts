import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatLegacyTableDataSource as MatTableDataSource } from '@angular/material/legacy-table';
import { MatLegacyPaginator as MatPaginator } from '@angular/material/legacy-paginator';
import { MatLegacyDialogRef as MatDialogRef, MatLegacyDialog as MatDialog, MatLegacyDialogConfig as MatDialogConfig } from "@angular/material/legacy-dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatLegacySpinner as MatSpinner } from '@angular/material/legacy-progress-spinner';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { BunruiService } from './../../services/bunrui.service';
import { VendsService } from './../../mstvendor/vends.service';
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';
import { HdnohelpComponent } from './../hdnohelp/hdnohelp.component';

interface Siiden {
  denno: number;
  inday: Date;
  vcode: string;
  hdenno: number;
  scode: string;
  tcode: number;
  // del: boolean;
  updated_at: Date;
  updated_by: string;
  gcode: string;
}

@Component({
  selector: 'app-sdnohelp',
  templateUrl: './sdnohelp.component.html',
  styleUrls: ['./../../help.component.scss']
})
export class SdnohelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
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
  fsdno: number;
  fhdno: number;

  constructor(public usrsrv: UserService,
    public stfsrv: StaffService,
    public vensrv: VendsService,
    public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    private overlay: Overlay,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<SdnohelpComponent>) {
    this.dataSource = new MatTableDataSource<Siiden>();
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
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
    let varWh: { [k: string]: any } = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
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
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        if (data.trsiiden.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = [];
          data.trsiiden.forEach(element => {
            let { trsiimeis, ...rest } = element;
            let gcd = { gcode: trsiimeis[0].gcode };
            srcdata.push({ ...rest, ...gcd });
          });
          this.dataSource = new MatTableDataSource<Siiden>(srcdata);
          this.dataSource.paginator = this.paginator;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_siiden', error);
      });
  }
  sel_dno(selected: Siiden) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }



}
