import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 保存時に発注明細（trhatmei）へ渡す値。day / yday は日付文字列（未入力は null） */
export type HatmeiInput = Pick<mwI.Hatmei, 'line' | 'inday' | 'gcode' | 'gtext' | 'suu' | 'genka' | 'money' | 'taxrate' | 'mmemo' | 'spec' | 'jdenno' | 'jline' | 'yday' | 'ydaykbn' | 'mtax'> & {
  id: number;
  denno: number;
  day: string | null;
};
/** 保存時に発注伝票（trhatden）の更新へ渡す値。day は日付文字列 */
export type HatdenSet = Pick<mwI.Hatden, 'vcode' | 'scode' | 'tcode' | 'dmemo' | 'gtotal' | 'tax' | 'total' | 'updated_by' | 'currency'> & {
  day: string | null;
  autoproc: boolean | string;
  inmemo: string;
  updated_at: Date;
};

/** 新規登録時に発注伝票（trhatden）へ渡す値。hdstatus は発注状況 */
export type HatdenNew = HatdenSet & { id: number; denno: number; created_at: Date; created_by: string; hdstatus: string };

interface AffectedRows { affected_rows: number }
/** get_hatden クエリの結果 */
interface HatdenResult { trhatden_by_pk: mwI.Trhatden | null }
/** upd_hatden ミューテーションの結果 */
export interface UpdHatdenResult { update_trhatden: AffectedRows; delete_trhatmei: AffectedRows; insert_trhatmei: AffectedRows }
/** ins_hatden ミューテーションの結果 */
export interface InsHatdenResult { insert_trhatden: AffectedRows; insert_trhatmei: AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class HatmeiService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  public hatmei: mwI.Hatmei[] = []; //読込時にfrmsupply⇒hmeitblコンポーネントへ渡すときのみ使用
  // public subject = new Subject<mwI.Hatmei[]>();
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  private GetTran = gql`
    query get_hatden($dno: Int!, $id: smallint!) {
      trhatden_by_pk(denno: $dno, id: $id) {
        vcode
        day
        scode
        tcode
        autoproc
        gtotal
        jdenno
        total
        dmemo
        inmemo
        created_at
        created_by
        tax
        updated_at
        updated_by
        currency
        msvendor {
          mtax
        }
        vhatzns {
          day
          gcode
          gtext
          inday
          jdenno
          jline
          line
          mmemo
          money
          spec
          genka
          suu
          taxrate
          yday
          ydaykbn
          mtax
          hatzn
          msgood {
            unit
          }
        }
      }
    }`;

  qryHatden(denno: number): Observable<mwI.Trhatden | null> {
    // console.log(denno);
    // return new Promise( (resolve,reject) => {
    let observable: Observable<mwI.Trhatden | null> = new Observable<mwI.Trhatden | null>(observer => {
      this.apollo.watchQuery<HatdenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data);
          observer.next((data as HatdenResult).trhatden_by_pk);
          // return resolve(data.trhatden_by_pk);
        }, (error) => {
          // return reject(error);
          observer.error(error);
        });
    });
    return observable;
  }
  updHatden(denno: number, hatden: HatdenSet, hatmei: HatmeiInput[]): Promise<UpdHatdenResult> {
    const UpdateTran = gql`
      mutation upd_hatden($id: smallint!, $hdno: Int!,$_set: trhatden_set_input!,$obj:[trhatmei_insert_input!]!) {
        update_trhatden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trhatmei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trhatmei(objects: $obj) {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<UpdHatdenResult>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: hatden,
          obj: hatmei
        },
        refetchQueries: [
          {
            query: this.GetTran,
            variables: {
              id: this.usrsrv.compid,
              dno: denno
            },
          }],
      }).subscribe(({ data }) => {
        return resolve(data as UpdHatdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  insHatden(hatden: HatdenNew[], hatmei: HatmeiInput[]): Promise<InsHatdenResult> {
    const InsertTran = gql`
      mutation ins_hatden($obj:[trhatden_insert_input!]!,$objm:[trhatmei_insert_input!]!) {
        insert_trhatden(objects: $obj)  {
          affected_rows
        }
        insert_trhatmei(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<InsHatdenResult>({
        mutation: InsertTran,
        variables: {
          obj: hatden,
          objm: hatmei
        },
      }).subscribe(({ data }) => {
        return resolve(data as InsHatdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  getHdsta(hmei: Pick<mwI.Hatmei, 'inday' | 'yday' | 'ydaykbn'>[]): string {
    let flg0: boolean = false;//発注済
    let flg1: boolean = false;//入荷予定あり
    let flg2: boolean = false;//入荷確定あり
    let flg3: boolean = false;//仕入済あり
    let ret: string = "";

    hmei.forEach((e) => {
      if (e.inday) {
        flg3 = true;
      } else if (e.yday && e.ydaykbn == '0') {
        flg2 = true;
      } else if (e.yday && e.ydaykbn == '1') {
        flg1 = true;
      } else {
        flg0 = true;
      }
    });
    if (flg3 && !flg2 && !flg1 && !flg0) {
      ret = '5';
    } else if (flg3 && (flg2 || flg1 || flg0)) {
      ret = '4';
    } else if (flg2 && !flg1 && !flg0) {
      ret = '3';
    } else if (flg2 && (flg1 || flg0)) {
      ret = '2';
    } else {
      ret = '1';
    }
    return ret;
  }
}
