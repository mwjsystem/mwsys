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
// import { BunruiService } from './../../services/bunrui.service';
import { VendsService } from './../../mstvendor/vends.service';
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';

interface Hatden {
  denno: number;
  day: Date;
  // hdstatus: string;
  vcode: string;
  scode: string;
  tcode: number;
  del: boolean;
  updated_at: Date;
  updated_by: string;
  gcode: string;
}

@Component({
  selector: 'app-hdnohelp',
  templateUrl: './hdnohelp.component.html',
  styleUrls: ['./../../help.component.scss']
})
export class HdnohelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<Hatden>;
  subject = new Subject<Hatden[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'day',
    // 'hdstatus',
    'vcode',
    'scode',
    'tcode',
    // 'del',
    'updated_at',
    'updated_by',
    'gcode'
  ];

  fvcd: string = "";
  fday: Date = new Date();
  ftcd: string = "";
  // fhdst = ["1", "2", "3", "4"];

  constructor(public usrsrv: UserService,
    public stfsrv: StaffService,
    public vensrv: VendsService,
    // public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    private overlay: Overlay,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<HdnohelpComponent>) {
    this.dataSource = new MatTableDataSource<Hatden>();
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
          this.fvcd = data.code;
          // this.set_mcdtxt(this.fmcd);
        }
      }
    );
  }
  get_hatden(): void {
    let varWh: { [k: string]: any } = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.fvcd) {
      varWh.where._and.push({ "vcode": { "_eq": this.fvcd } });
    }
    if (this.fday) {
      varWh.where._and.push({ "day": { "_gt": this.fday } });
    }
    // if (this.fhdst.length > 0) {
    //   varWh.where._and.push({ "hdstatus": { "_in": this.fhdst } });
    // }
    if (this.ftcd) {
      varWh.where._and.push({ "tcode": { "_eq": this.ftcd } });
    }

    // console.log(this.fhdst,varWh);

    const GetTran = gql`
    query get_hatden($where:trhatden_bool_exp!) {
      trhatden(where:$where, order_by:{denno: asc}) {
        denno
        day
        scode
        vcode
        tcode 
        updated_at
        updated_by
        trhatmeis(where:{line:{_eq:1}}){ 
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
        if (data.trhatden.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = [];
          data.trhatden.forEach(element => {
            let { trhatmeis, ...rest } = element;
            let gcd = { gcode: trhatmeis[0].gcode };
            srcdata.push({ ...rest, ...gcd });
          });
          this.dataSource = new MatTableDataSource<Hatden>(srcdata);
          this.dataSource.paginator = this.paginator;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_hatden', error);
      });
  }
  sel_dno(selected: Hatden) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
