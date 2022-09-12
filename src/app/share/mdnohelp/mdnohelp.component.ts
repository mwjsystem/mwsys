import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialog } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StoreService } from './../../services/store.service';
import { StaffService } from './../../services/staff.service';

interface Movsub {
  denno: number;
  day: Date;
  incode: string;
  outcode: string;
  tcode: string;
  obikou: string;
  updated_at: Date;
  updated_by: string
}

@Component({
  selector: 'app-mdnohelp',
  templateUrl: './mdnohelp.component.html',
  styleUrls: ['./../../help.component.scss']
})
export class MdnohelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<Movsub>;
  // subject = new Subject<Movsub[]>();
  // observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'day',
    'incode',
    'outcode',
    'tcode',
    'obikou',
    'updated_at',
    'updated_by'
  ];
  fincd: string = "";
  foutcd: string = "";
  fday: Date = new Date();
  ftcd: string = "";
  constructor(public usrsrv: UserService,
    public stfsrv: StaffService,
    public strsrv: StoreService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    private overlay: Overlay,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<MdnohelpComponent>) { }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
  }
  get_movden(): void {
    let varWh: { [k: string]: any } = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.fday) {
      varWh.where._and.push({ "day": { "_gt": this.fday } });
    }
    if (this.fincd) {
      varWh.where._and.push({ "incode": { "_eq": this.fincd } });
    }
    if (this.foutcd) {
      varWh.where._and.push({ "outcode": { "_eq": this.foutcd } });
    }
    if (this.ftcd) {
      varWh.where._and.push({ "tcode": { "_eq": this.ftcd } });
    }
    const GetTran = gql`
    query get_movden($where:trmovsub_bool_exp!) {
      trmovsub(where: $where, order_by:{denno: asc}) {
        denno
        day
        incode
        outcode
        tcode
        obikou
        updated_at
        updated_by
      }
    }`;
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        if (data.trmovsub.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = data.trmovsub;
          this.dataSource = new MatTableDataSource<Movsub>(srcdata);
          this.dataSource.paginator = this.paginator;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_movsub', error);
      });

  }
  sel_dno(selected: Movsub) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
