import { Component, OnInit, OnDestroy, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialog, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject, Subscription } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StoreService } from './../../services/store.service';
import { StaffService } from './../../services/staff.service';
import { HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { StaffPipe } from '../../core/pipes/staff.pipe';

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

/** get_movden クエリの結果 */
interface MovsubResult { trmovsub: Movsub[] }

@Component({
    selector: 'app-mdnohelp',
    templateUrl: './mdnohelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatSelect, FormsModule, MatOption, MatInput, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MatButton, MatIcon, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, StaffPipe]
})
export class MdnohelpComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private dialog = inject(MatDialog);
  private dialogRef = inject<MatDialogRef<MdnohelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource = new MatTableDataSource<Movsub>([]);
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
  private querySub?: Subscription;

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.overlayRef.dispose();
  }
  get_movden(): void {
    let varWh: HasuraWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
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
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<MovsubResult>({
      query: GetTran,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        if (!data) {
          return;
        }
        const result = data as MovsubResult;
        if (result.trmovsub.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata = result.trmovsub;
          this.dataSource = new MatTableDataSource<Movsub>(srcdata);
          this.dataSource.paginator = this.paginator() ?? null;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_movsub', error);
        this.overlayRef.detach();
      });

  }
  sel_dno(selected: Movsub) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
