import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';

@Injectable({
  providedIn: 'root'
})
export class MembsService {
  public mcode: string = "";
  public membs: mwI.Mcode[] = [];
  public edas: mwI.Edahlp[] = [];
  public adrs: mwI.Adrs[] = [];
  constructor(private usrsrv: UserService,
    private apollo: Apollo) { }

  getMembers(): Promise<Boolean> {
    const GetMast = gql`
    query get_members($id: smallint!) {
      msmember(where: {id: {_eq: $id},daibunrui: {_iregex: "^(?!2).*$"}}, order_by: {mcode: asc}) {
        mcode
        sei
        mei
        del
      }
    }`;
    return new Promise<Boolean>(resolve => {
      this.apollo.watchQuery<any>({
        query: GetMast,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.membs = data.msmember;
          resolve(true);
        }, (error) => {
          console.log('error query get_members', error);
        });
    });
  }

  getMcdtxt(mcd: string): string {
    const i: number = this.membs.findIndex(obj => obj.mcode == mcd);
    let mcdtxt: string = "";
    if (i > -1) {
      mcdtxt = this.membs[i].mei ?? "";
      mcdtxt = this.membs[i].sei + mcdtxt;
    } else {
      mcdtxt = "";
    }
    // console.log(mcdtxt);
    return mcdtxt;
  }
}