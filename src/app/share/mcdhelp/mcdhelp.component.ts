import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ElementRef, ChangeDetectorRef, viewChild, inject } from '@angular/core';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { HasuraCond, HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';

export interface Mcd {
  mcode: string;
  sei: string;
  mei: string;
  kana: string;
  mail: string;
  tcode1: string;
  tcode2: string;
  eda: number;
  zip: string;
  region: string;
  local: string;
  street: string;
  extend: string;
  extend2: string;
  adrname: string;
  tel: string;
}


/** 顧客検索の条件。where2 は住所（msmadrs）側の条件 */
type McdWhere = HasuraWhere & { where2?: { _and: HasuraCond[] } };
/** get_members クエリの住所 */
interface McdAdr { eda: number; zip: string; region: string; local: string; street: string; extend: string; extend2: string; adrname: string; tel: string; tel2: string; tel3: string; fax: string }
/** get_members クエリの顧客 */
interface McdMember { mcode: string | number; sei: string; mei: string; kana: string; mail: string; mail2: string; mail3: string; mail4: string; mail5: string; tcode1: string; tcode2: string; msmadrs: McdAdr[] }
interface McdResult { msmember: McdMember[] }
@Component({
    selector: 'app-mcdhelp',
    templateUrl: './mcdhelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatInput, FormsModule, MatSelect, MatOption, MatCheckbox, MatButton, MatIcon, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions]
})
export class McdhelpComponent implements OnInit, OnDestroy {
  private dialogRef = inject<MatDialogRef<McdhelpComponent>>(MatDialogRef);
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private overlay = inject(Overlay);
  private cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);


  readonly paginator = viewChild(MatPaginator);
  dataSource: MatTableDataSource<Mcd>;
  displayedColumns = ['mcode', 'sei', 'kana', 'tcode1', 'tcode2', 'eda', 'zip', 'region', 'local', 'street', 'extend', 'extend2', 'adrname', 'tel', 'mail', 'webid'];
  fname: string = "";
  fkana: string = "";
  fmail: string = "";
  fadrnm: string = "";
  ftel: string = "";
  fwebid: string = "";
  ftcd1: string = "";
  ftcd: string = "";
  feda0: boolean = true;
  fnorm: boolean = true;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  public mcds: Mcd[] = [];
  private querySub?: Subscription;

  constructor() {
    this.dataSource = new MatTableDataSource<Mcd>(this.mcds);
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff.code;
    this.dataSource = new MatTableDataSource<Mcd>(this.mcds);
    this.dataSource.paginator = this.paginator() ?? null;
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.overlayRef.dispose();
  }

  convKana(event: Event): string {
    return this.usrsrv.convKana((event.target as HTMLInputElement)?.value);
  }

  filterMcd() {
    let varWh: McdWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    // console.log(varWh,varWh.where);
    if (this.fname) {
      varWh['where']._and.push({
        "_or": [{ "sei": { "_like": "%" + this.fname + "%" } },
        { "mei": { "_like": "%" + this.fname + "%" } }
        ]
      });
    }
    if (this.fkana) {
      varWh['where']._and.push({ "kana": { "_like": "%" + this.fkana + "%" } });
    }
    if (this.fwebid) {
      varWh['where']._and.push({ "webid": { "_like": "%" + this.fwebid + "%" } });
    }
    if (this.fmail) {
      varWh['where']._and.push({
        "_or": [{ "mail": { "_like": "%" + this.fmail + "%" } },
        { "mail2": { "_like": "%" + this.fmail + "%" } },
        { "mail3": { "_like": "%" + this.fmail + "%" } },
        { "mail4": { "_like": "%" + this.fmail + "%" } },
        { "mail5": { "_like": "%" + this.fmail + "%" } }
        ]
      });
    }
    // 住所（msmadrs）側の条件。1 件でも複数でも _and の配列にまとめて渡す
    const adrConds: HasuraCond[] = [];
    if (this.fadrnm) {
      adrConds.push({
        "_or": [{ "extend": { "_like": "%" + this.fadrnm + "%" } },
        { "extend2": { "_like": "%" + this.fadrnm + "%" } },
        { "adrname": { "_like": "%" + this.fadrnm + "%" } }
        ]
      });
    }
    if (this.ftel) {
      adrConds.push({ "ftel": { "_like": "%" + this.ftel + "%" } });
    }
    if (this.ftcd) {
      varWh['where']._and.push({ "tcode": { "_eq": this.ftcd } });
    }
    if (this.ftcd1) {
      varWh['where']._and.push({ "tcode1": { "_eq": this.ftcd1 } });
    }
    if (this.feda0) {
      adrConds.push({ "eda": { "_eq": 0 } });
    }
    if (adrConds.length > 0) {
      varWh['where2'] = { "_and": adrConds };
    }
	if (this.fnorm) {
      varWh['where']._and.push({ "daibunrui": { "_iregex": "^(?!2).*$" } });
    }
    // console.log(varWh, varWh['where2'] != null);
    this.mcds = [];
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<McdResult>({
      query: Query.GetMast,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data: raw }) => {
        if (!raw) {
          this.overlayRef.detach();
          this.cdRef.detectChanges();
          return;
        }
        const data = raw as McdResult;
        for (let i = 0; i < data.msmember.length; i++) {
          for (let j = 0; j < data.msmember[i].msmadrs.length; j++) {
            this.mcds.push({
              mcode: data.msmember[i].mcode.toString(),
              sei: data.msmember[i].sei,
              mei: data.msmember[i].mei,
              kana: data.msmember[i].kana,
              mail: this.usrsrv.setMail(data.msmember[i].mail, data.msmember[i].mail2, data.msmember[i].mail3, data.msmember[i].mail4, data.msmember[i].mail5),
              tcode1: data.msmember[i].tcode1,
              tcode2: data.msmember[i].tcode2,
              // del:data.msmember[i].msmadrs[j].edl,
              eda: data.msmember[i].msmadrs[j].eda,
              zip: data.msmember[i].msmadrs[j].zip,
              region: data.msmember[i].msmadrs[j].region,
              local: data.msmember[i].msmadrs[j].local,
              street: data.msmember[i].msmadrs[j].street,
              extend: data.msmember[i].msmadrs[j].extend,
              extend2: data.msmember[i].msmadrs[j].extend2,
              adrname: data.msmember[i].msmadrs[j].adrname,
              tel: this.usrsrv.setTel(data.msmember[i].msmadrs[j].tel, data.msmember[i].msmadrs[j].tel2, data.msmember[i].msmadrs[j].tel3, data.msmember[i].msmadrs[j].fax)
            });
          }
        }
        // console.log(this.mcds);
        this.dataSource = new MatTableDataSource<Mcd>(this.mcds);
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_members', error);
        this.overlayRef.detach();
      });
  }
  selMcd(selected: Mcd) {
    // console.log("select",selected);
    this.mcds = [];
    this.dialogRef.close(selected);
  }

  close() {
    this.mcds = [];
    this.dialogRef.close();
  }

}
