import { Component, OnInit, ChangeDetectionStrategy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatDialogRef } from "@angular/material/dialog";
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';

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


@Component({
  selector: 'app-mcdhelp',
  templateUrl: './mcdhelp.component.html',
  styleUrls: ['./../../help.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class McdhelpComponent implements OnInit {

  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
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

  constructor(private dialogRef: MatDialogRef<McdhelpComponent>,
    public usrsrv: UserService,
    public stfsrv: StaffService,
    private overlay: Overlay,
    private cdRef: ChangeDetectorRef,
    private apollo: Apollo) {
    this.dataSource = new MatTableDataSource<Mcd>(this.mcds);
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff.code;
    this.dataSource = new MatTableDataSource<Mcd>(this.mcds);
    this.dataSource.paginator = this.paginator;
  }

  convKana(event: KeyboardEvent): string {
    return this.usrsrv.convKana((event.target as HTMLInputElement)?.value);
  }

  filterMcd() {
    let varWh: { [k: string]: any } = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
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
    if (this.fadrnm) {
      varWh['where2'] = {
        "_and": [{
          "_or": [{ "extend": { "_like": "%" + this.fadrnm + "%" } },
          { "extend2": { "_like": "%" + this.fadrnm + "%" } },
          { "adrname": { "_like": "%" + this.fadrnm + "%" } }
          ]
        }]
      };
    }
    if (this.ftel) {
      if (varWh['where2'] != null) {
        varWh['where2']._and.push({ "ftel": { "_like": "%" + this.ftel + "%" } });
      } else {
        varWh['where2'] = { "ftel": { "_like": "%" + this.ftel + "%" } };
      }

    }
    if (this.ftcd) {
      varWh['where']._and.push({ "tcode": { "_eq": this.ftcd } });
    }
    if (this.ftcd1) {
      varWh['where']._and.push({ "tcode1": { "_eq": this.ftcd1 } });
    }
    if (this.feda0) {
      if (varWh['where2'] != null) {
        varWh['where2']._and.push({ "eda": { "_eq": 0 } });
      } else {
        varWh['where2'] = { "eda": { "_eq": 0 } };
      }
    }
	if (this.fnorm) {
      varWh['where']._and.push({ "daibunrui": { "_iregex": "^(?!2).*$" } });
    }
    // console.log(varWh, varWh['where2'] != null);
    this.mcds = [];
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: Query.GetMast,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
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
