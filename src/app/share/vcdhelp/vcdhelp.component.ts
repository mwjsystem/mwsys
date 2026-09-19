import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";
import { Observable } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { VendsService } from './../../mstvendor/vends.service';
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
  styleUrls: ['./../../help.component.scss']
})
export class VcdhelpComponent implements OnInit {
  // public vcds: Vendor[]=[];
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  dataSource: MatTableDataSource<mwI.Vendor>;
  displayedColumns = ['code', 'adrname', 'kana', 'tanto', 'tel', 'tel2', 'tel3', 'fax', 'mail1', 'mail2', 'mail3', 'mail4', 'mail5', 'zip', 'region', 'local', 'url'];
  filter: string = "";

  constructor(public usrsrv: UserService,
    private vensrv: VendsService,
    private apollo: Apollo,
    private dialogRef: MatDialogRef<VcdhelpComponent>) {
    this.dataSource = new MatTableDataSource<mwI.Vendor>();
  }

  ngOnInit(): void {
    // this.vensrv.observe.subscribe(value => {
    this.dataSource = new MatTableDataSource<mwI.Vendor>(this.vensrv.vends);
    this.dataSource.paginator = this.paginator;
    // });
  }

  applyFilter(event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
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
