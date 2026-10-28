import { Component, OnInit, ElementRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Observable } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { VendsService } from './../../mstvendor/vends.service';
import { MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
// import { Ggrp,GoodsService } from './../../services/goods.service';

interface Vendor {
  code: string;
  adrname: string;
  kana: string;
  tel: string;
  tel2: string;
  tel3: string;
  fax: string;
  mail1: string;
  mail2: string;
  mail3: string;
  mail4: string;
  mail5: string;
  tanto: string;
  url: string;
  del: string;
  ftel: string;
  zip: string;
  region: string;
  local: string;
}

@Component({
    selector: 'app-vcdhelp',
    templateUrl: './vcdhelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatInput, FormsModule, MatButton, MatIcon, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions]
})
export class VcdhelpComponent implements OnInit {
  usrsrv = inject(UserService);
  private vensrv = inject(VendsService);
  private apollo = inject(Apollo);
  private dialogRef = inject<MatDialogRef<VcdhelpComponent>>(MatDialogRef);

  // public vcds: Vendor[]=[];
  readonly paginator = viewChild(MatPaginator);
  dataSource: MatTableDataSource<mwI.Vendor>;
  displayedColumns = ['code', 'adrname', 'kana', 'tanto', 'tel', 'tel2', 'tel3', 'fax', 'mail1', 'mail2', 'mail3', 'mail4', 'mail5', 'zip', 'region', 'local', 'url'];
  filter: string = "";

  constructor() {
    this.dataSource = new MatTableDataSource<mwI.Vendor>();
  }

  ngOnInit(): void {
    this.dataSource.data = this.vensrv.vends;
    this.dataSource.paginator = this.paginator() ?? null;
  }

  search(): void {
    const term = this.filter.trim().toLowerCase();
    this.dataSource.data = term
      ? this.vensrv.vends.filter(v => JSON.stringify(v).toLowerCase().includes(term))
      : this.vensrv.vends;
  }

  selVcd(selected: Vendor) {
    // console.log("select",selected);
    // this.vcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    // this.vcds=[];
    this.dialogRef.close();
  }


}
