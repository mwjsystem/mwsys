import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';

/** get_members クエリの結果 */
interface MembersResult { msmember: mwI.Mcode[] }

const GET_MEMBERS = gql`
    query get_members($id: smallint!) {
      msmember(where: {id: {_eq: $id},daibunrui: {_iregex: "^(?!2).*$"}}, order_by: {mcode: asc}) {
        mcode
        sei
        mei
        del
      }
    }`;

/** 顧客マスタで新規登録したことを、受注伝票のタブへ知らせるチャンネル（No.27） */
export const MEMBER_CHANNEL = 'mwsys-member';
/** そのとき送る中身 */
export interface MemberCreated { mcode: string }

@Injectable({
  providedIn: 'root'
})
export class MembsService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  public mcode: string = "";
  public membs: mwI.Mcode[] = [];
  public edas: mwI.Edahlp[] = [];
  public adrs: mwI.Adrs[] = [];

  getMembers(): Promise<Boolean> {
    return new Promise<Boolean>(resolve => {
      this.apollo.watchQuery<MembersResult>({
        query: GET_MEMBERS,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.membs = data ? (data as MembersResult).msmember : [];
          resolve(true);
        }, (error) => {
          console.log('error query get_members', error);
        });
    });
  }

  /** 顧客の一覧をサーバーから読み直す（別のタブで顧客を新規登録したあと、名前を出せるように） */
  reload(): Promise<void> {
    return firstValueFrom(this.apollo.query<MembersResult>({
      query: GET_MEMBERS,
      fetchPolicy: 'network-only',
      variables: { id: this.usrsrv.compid },
    })).then(({ data }) => {
      this.membs = data ? data.msmember : this.membs;
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