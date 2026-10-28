import { Component, OnInit, ChangeDetectionStrategy, ElementRef, ChangeDetectorRef, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { Subject } from 'rxjs';
import { HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatSelect, MatOption } from '@angular/material/select';
import { StaffPipe } from '../../core/pipes/staff.pipe';
import { VcdtxtPipe } from '../../core/pipes/vcdtxt.pipe';

interface Ggrp {
  code: string;
  name: string;
  kana: string;
  gkbn: string;
  sozai: string;
  vcode: string;
  tcode: string;
}

/** get_ggroup クエリの結果 */
interface GgroupResult { msggroup: Ggrp[] }

@Component({
    selector: 'app-grpcdhelp',
    templateUrl: './grpcdhelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatInput, FormsModule, MatButton, MatIcon, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatSelect, MatOption, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, StaffPipe, VcdtxtPipe]
})
export class GrpcdhelpComponent implements OnInit {
  private dialogRef = inject<MatDialogRef<GrpcdhelpComponent>>(MatDialogRef);
  usrsrv = inject(UserService);
  cdRef = inject(ChangeDetectorRef);
  bunsrv = inject(BunruiService);
  private apollo = inject(Apollo);

  readonly paginator = viewChild(MatPaginator);
  dataSource: MatTableDataSource<Ggrp>;
  displayedColumns = ['code', 'name', 'kana', 'gkbn', 'sozai', 'vcode', 'tcode'];
  public ggrps!: Ggrp[];
  public code: string = "";
  public kana: string = "";
  public name: string = "";
  public tcode: string = "";
  public subject = new Subject<Boolean>();
  public observe = this.subject.asObservable();

  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    // console.log(data);
    this.dataSource = new MatTableDataSource<Ggrp>(this.ggrps);
    if (typeof data != 'undefined') {
      this.code = (data?.code ?? '');
      if (this.code) { this.filterGcd(); }
    }
  }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator() ?? null;
    this.dataSource = new MatTableDataSource<Ggrp>(this.ggrps);
    this.observe.subscribe((flg) => this.refresh());

  }

  convUpper(event: Event): string {
    return this.usrsrv.convUpper((event.target as HTMLInputElement)?.value);
  }

  convKana(event: Event): string {
    return this.usrsrv.convKana((event.target as HTMLInputElement)?.value);
  }

  filterGcd() {
    let varWh: HasuraWhere = {
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
    this.apollo.watchQuery<GgroupResult>({
      query: GetMast,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // if(data.msggroup.length===0){
        if (!data) {
          return;
        }
        const result = data as GgroupResult;
        if (result.msggroup.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          this.ggrps = result.msggroup;
          this.subject.next(true);
        }
        // }

        // this.subject.complete();
      }, (error) => {
        console.log('error query get_ggroup', error);
      });
  }

  setGrpcd(selected: Ggrp) {
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
    this.dataSource.paginator = this.paginator() ?? null;
  }

}