import { Component, OnInit, ChangeDetectionStrategy, ViewChild, ElementRef, ChangeDetectorRef, Inject } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { Subject } from 'rxjs';

interface Ggrp {
  code: string;
  name: string;
  kana: string;
  gkbn: string;
  sozai: string;
  vcode: string;
  tcode: string;
}

@Component({
  selector: 'app-grpcdhelp',
  templateUrl: './grpcdhelp.component.html',
  styleUrls: ['./../../help.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GrpcdhelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  dataSource: MatTableDataSource<Ggrp>;
  displayedColumns = ['code', 'name', 'kana', 'gkbn', 'sozai', 'vcode', 'tcode'];
  public ggrps: Ggrp[];
  public code: string = "";
  public kana: string = "";
  public name: string = "";
  public tcode: string = "";
  public subject = new Subject<Boolean>();
  public observe = this.subject.asObservable();

  constructor(private dialogRef: MatDialogRef<GrpcdhelpComponent>,
    public usrsrv: UserService,
    public cdRef: ChangeDetectorRef,
    // public gdssrv: GoodsService,
    public bunsrv: BunruiService,
    private apollo: Apollo,
    @Inject(MAT_DIALOG_DATA) data) {
    // console.log(data);
    this.dataSource = new MatTableDataSource<Ggrp>(this.ggrps);
    if (typeof data != 'undefined') {
      this.code = (data?.code ?? '');
      if (this.code) { this.filterGcd(); }
    }
  }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource = new MatTableDataSource<Ggrp>(this.ggrps);
    this.observe.subscribe((flg) => this.refresh());

  }

  convUpper(event: KeyboardEvent): string {
    return this.usrsrv.convUpper((event.target as HTMLInputElement)?.value);
  }

  convKana(event: KeyboardEvent): string {
    return this.usrsrv.convKana((event.target as HTMLInputElement)?.value);
  }

  filterGcd() {
    let varWh: { [k: string]: any } = {
      "where": {
        "_and": [
          { "id": { "_eq": this.usrsrv.compid } }
        ]
      }
    };
    if (this.code !== "") {
      varWh['where']._and.push({ "code": { "_like": "%" + this.code + "%" } });
    }
    if (this.kana !== "") {
      varWh['where']._and.push({ "kana": { "_like": "%" + this.kana + "%" } });
    }
    if (this.name !== "") {
      varWh['where']._and.push({ "name": { "_like": "%" + this.name + "%" } });
    }
    const GetMast = gql`
    query get_ggroup($where:msggroup_bool_exp!) {
      msggroup(where:$where) {
        code
        name
        kana
        gkbn
        sozai
        vcode
        tcode
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // if(data.msggroup.length===0){
        if (data.msggroup.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          this.ggrps = data.msggroup;
          this.subject.next(true);
        }
        // }

        // this.subject.complete();
      }, (error) => {
        console.log('error query get_ggroup', error);
      });
  }

  setGrpcd(selected) {
    // console.log("select",selected);
    // this.mcdsrv.mcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    // this.mcdsrv.mcds=[];
    this.dialogRef.close();
  }

  refresh(): void {
    //tableのデータソース更新
    this.dataSource = new MatTableDataSource<Ggrp>(this.ggrps);
    this.dataSource.paginator = this.paginator;
  }

}