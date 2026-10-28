import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

/** get_souko クエリの結果（倉庫の一覧） */
interface StoreResult { msstore: { code: string; subname: string }[] }
/** 倉庫の住所（帳票のヘッダ用） */
export interface Stradr { name: string; zip: string; region: string; local: string; street: string; extend: string; tel: string; fax: string }
/** get_souko クエリの結果（倉庫 1 件の住所） */
interface StradrResult { msstore_by_pk: Stradr | null }
@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);


  public scds: mwI.Sval[] = [];

  getStore(): void {
    if (this.scds.length == 0) {
      const GetMast = gql`
      query get_souko($id: smallint!) {
        msstore(where: {id: {_eq: $id}, del: {_eq: false}},order_by: {sort: asc}) {
          code
          subname
        }
      }`;
      this.apollo.watchQuery<StoreResult>({

        query: GetMast,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          (data ? (data as StoreResult).msstore : []).forEach(e => {
            this.scds.push({ value: e.code, viewval: e.subname });
          });
        }, (error) => {
          console.log('error query get_store', error);
        });
    }
  }

  // 見つからないときは null、通信エラーのときはエラー自体が返る（従来どおり。呼び出し側は確認していない）
  async getStradr(scd: string): Promise<Stradr | null> {
    const GetMast = gql`
    query get_souko($id: smallint!,$scd: String!) {
      msstore_by_pk(id:$id,code:$scd) {
        name
        zip
        region
        local
        street
        extend
        tel
        fax
      }
    }`;
    return new Promise(resolve => {
      this.apollo.watchQuery<StradrResult>({
        query: GetMast,
        variables: {
          id: this.usrsrv.compid,
          scd: scd
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          if (!data) {
            return;
          }
          return resolve((data as StradrResult).msstore_by_pk);
        }, (error) => {
          console.log('error query get_stradr', error);
          return resolve(error);
        });
    });
  }
}