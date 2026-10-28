import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';

/** get_vendors クエリの結果 */
interface VendorsResult { msvendor: mwI.Vendor[] }
/** 帳票のヘッダに使う仕入先の情報。見つからないときは空文字 */
export interface VendorInfo { name: string; mtax: string; currency: string; tel: string; fax: string }

@Injectable({
  providedIn: 'root'
})
export class VendsService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);


  vends: mwI.Vendor[] = [];

  getVendors(): Promise<Boolean> {
    const GetMast = gql`
    query get_vendors($id: smallint!) {
      msvendor(where: {id: {_eq: $id}}, order_by: {code: asc}) {
        code
        adrname
        kana
        mtax
        currency
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
    return new Promise<Boolean>(resolve => {
      this.apollo.watchQuery<VendorsResult>({
        query: GetMast,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.vends = data ? (data as VendorsResult).msvendor : [];
          resolve(true);
        }, (error) => {
          console.log('error query get_vendors', error);
        });
    });
  }

  getVcdtxt(vcd: string): string {
    const i: number = this.vends.findIndex(obj => obj.code == vcd);
    let vcdtxt: string = "";
    if (i > -1) {
      vcdtxt = this.vends[i].adrname;
    } else {
      vcdtxt = "";
    }
    return vcdtxt;
  }
  getVendor(vcd: string): VendorInfo {
    let vendor: VendorInfo;
    const i: number = this.vends.findIndex(obj => obj.code == vcd);
    if (i > -1) {
      vendor = {
        name: this.vends[i].adrname,
        mtax: this.vends[i].mtax,
        currency: this.vends[i].currency,
        tel: this.vends[i].tel,
        fax: this.vends[i].fax
      };
    } else {
      vendor = { name: "", mtax: "", currency: "", tel: "", fax: "" };
    }
    return vendor;
  }

}