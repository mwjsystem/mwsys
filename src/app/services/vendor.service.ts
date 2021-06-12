import { Injectable } from '@angular/core';
// import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

export interface Vendor {
  code:string;
  adrname:string;
  kana:string;
  ftel:string;
  mail:string;
} 

@Injectable({
  providedIn: 'root'
})
export class VendorService {
  public vcds: Vendor[]=[];

  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

get_vendor(vcd:string){
    const GetMast = gql`
    query get_vendor($id: smallint!,$vcd:String!) {
      msvendor_by_pk(id: $id,code: $vcd) {
        code
        adrname
        kana
        zip
        region
        local
        street
        extend
        extend2
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
        adrbikou
        adrinbikou
        del
        ftel
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast, 
        variables: { 
          id : this.usrsrv.compid,
          vcd: vcd
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        data.msvendor_by_pk;
      },(error) => {
        console.log('error query get_Goods', error);
      });
  }            

  get_vendors(){
    const GetMast = gql`
    query get_vendor($id: smallint!) {
      msvendor(where: {id: {_eq: $id}}) {
        code
        adrname
        kana
        zip
        region
        local
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
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast, 
        variables: { 
          id : this.usrsrv.compid,
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        data.msgoods
        });
      },(error) => {
        console.log('error query get_Goods', error);
      });
  }            
}
