import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";
import { Observable } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
// import { Ggrp,GoodsService } from './../../services/goods.service';

interface Vendor {
  code:string;
  adrname:string;
  kana:string;
  tel:string;
  tel2:string;
  tel3:string;
  fax:string;
  mail1:string;
  mail2:string;
  mail3:string;
  mail4:string;
  mail5:string;
  tanto:string;
  url:string;
  del:string;
  ftel:string;
  zip:string;
  region:string;
  local:string;
} 

@Component({
  selector: 'app-vcdhelp',
  templateUrl: './vcdhelp.component.html',
  styleUrls: ['./vcdhelp.component.scss']
})
export class VcdhelpComponent implements OnInit {
  public vcds: Vendor[]=[];
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<Vendor>;
  displayedColumns = ['code','adrname','kana','tanto','tel','tel2','tel3','fax','mail1','mail2','mail3','mail4','mail5','zip','region','local','url']; 
  fadrnm:string="";
  fkana:string="";
  fmail:string="";
  ftel:string="";
  
  
  constructor(public usrsrv: UserService,
              private apollo: Apollo,
              private dialogRef: MatDialogRef<VcdhelpComponent>) {
                this.dataSource= new MatTableDataSource<Vendor>(this.vcds);
               }

  ngOnInit(): void {    
    this.get_vendors().subscribe(value => {
      this.dataSource.paginator = this.paginator;
      this.dataSource= new MatTableDataSource<Vendor>(value);
    });
  }

  get_vendors():Observable<Vendor[]>{
    let varWh: {[k: string]: any}={"where" : {"_and":[{"id": {"_eq": this.usrsrv.compid}}]}};
    // console.log(varWh,varWh.where);
    if (this.fadrnm!==""){
      varWh.where._and.push({"adrname" :{"_like":"%" + this.fadrnm + "%"}});
    }
    if (this.fkana!==""){
      varWh.where._and.push({"kana" : {"_like":"%" + this.fkana + "%"}});
    }
    if (this.fmail!==""){
      varWh.where._and.push({"_or" : [ {"mail":{"_like":"%" + this.fmail + "%"}},
                                        {"mail2":{"_like":"%" + this.fmail + "%"}},
                                        {"mail3":{"_like":"%" + this.fmail + "%"}},
                                        {"mail4":{"_like":"%" + this.fmail + "%"}},
                                        {"mail5":{"_like":"%" + this.fmail + "%"}}
                                      ]});
    }
    if (this.ftel!==""){
      // console.log(varWh,varWh.where2 != null);
      if (varWh.where2 != null){
          varWh.where2._and.push({"ftel" : {"_like":"%" + this.ftel + "%"}});
      } else {
        varWh.where2 = {"ftel" : {"_like":"%" + this.ftel + "%"}};
      }
    }
    const GetMast = gql`
    query get_vendors($where:msvendor_bool_exp!) {
      msvendor(where:$where, order_by:{code: asc}) {
        code
        adrname
        kana
        tel
        tel2
        tel3
        fax
        mail1
        mail2
        mail3
        mail4
        mail5
        tanto
        url
        del
        ftel
        zip
        region
        local
      }
    }`;
    let observable:Observable<Vendor[]> = new Observable<Vendor[]>(observer => {
      this.apollo.watchQuery<any>({
          query: GetMast, 
          variables: varWh
      })
      .valueChanges
      .subscribe(({ data }) => {
        observer.next(data.msvendor);
      },(error) => {
        console.log('error query get_vendors', error);
      });
    });
    return observable;
  }

  sel_vcd(selected:Vendor) {
    // console.log("select",selected);
    this.vcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    this.vcds=[];
    this.dialogRef.close();
  }


}
