import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, Inject } from '@angular/core';
import { MatLegacyTableDataSource as MatTableDataSource } from '@angular/material/legacy-table';
import { MatLegacyPaginator as MatPaginator } from '@angular/material/legacy-paginator';
import { MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA, MatLegacyDialogRef as MatDialogRef, MatLegacyDialog as MatDialog, MatLegacyDialogConfig as MatDialogConfig } from "@angular/material/legacy-dialog";
import { GcdhelpComponent } from './../gcdhelp/gcdhelp.component';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatLegacySpinner as MatSpinner } from '@angular/material/legacy-progress-spinner';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
// import { StaffService } from './../../services/staff.service';
// import { BunruiService } from './../../services/bunrui.service';

interface Hatmei {
  denno: number;
  line: number;
  day: Date;
  yday: Date;
  ydaykbn: string;
  // vcode: string;
  // scode: string;
  // tcode: number;
  gcode: string;
  gtext: string;
  suu: number;
  // tsuu: number;
  hatzn: number;
  mbiko: string;
  genka: number;
  money: number;
  spec: string;
  mtax: string;
  taxrate: string;
  msgood: { unit: string; };
}

@Component({
  selector: 'app-hmeihelp',
  templateUrl: './hmeihelp.component.html',
  styleUrls: ['./../../help.component.scss'],
})
export class HmeihelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<Hatmei>;
  subject = new Subject<Hatmei[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'line',
    'day',
    'yday',
    'ydaykbn',
    // 'inday',
    // 'vcode',
    // 'scode',
    // 'tcode',
    'gcode',
    'gtext',
    'suu',
    // 'tsuu',
    'hatzn',
    'mbiko'
    // 'genka',
    // 'money',
    // 'spec',
    // 'mtax',
    // 'taxrate'
  ];

  fvcd: string = "";
  fgcd: string = "";
  fday: Date = new Date();

  constructor(public usrsrv: UserService,
    // public stfsrv: StaffService,
    // public vensrv: VendsService,
    // public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    private overlay: Overlay,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<HmeihelpComponent>,
    @Inject(MAT_DIALOG_DATA) data) {
    this.fvcd = (data?.vcode ?? '');
    this.fgcd = (data?.gcode ?? '');
  }

  ngOnInit(): void {
    // this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
  }

  get_hatmei(): void {
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
    if (this.fgcd) {
      varWh.where._and.push({ "gcode": { "_eq": this.fgcd } });
    }
    varWh.where._and.push({ "hatzn": { "_gt": 0 } });

    const GetTran = gql`
    query get_hatmei($where:vhatzn_bool_exp!) {
      vhatzn(where:$where, order_by:{denno: asc}) {
        denno
        line
        day
        gcode
        gtext
        yday
        ydaykbn
        suu
        hatzn
        mbiko
        genka
        money
        spec
        mtax
        taxrate
        msgood{
          unit
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
        if (data.vhatzn.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = [];
          data.vhatzn.forEach(element => {
            srcdata.push(element);
          });
          this.dataSource = new MatTableDataSource<Hatmei>(srcdata);
          this.dataSource.paginator = this.paginator;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_vhatzn', error);
      });

  }
  gcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      gcode: this.fgcd,
      tkbn: ['0', '1']
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.fgcd = data.gcode;

        }
      }
    );
  }
  sel_dno(selected: Hatmei) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
