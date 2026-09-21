import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 保存時に仕入明細（trsiimei）へ渡す値。inday は日付文字列（未入力は null） */
export type SiimeiInput = Pick<mwI.Siimei, 'line' | 'inday' | 'gcode' | 'suu' | 'genka' | 'money' | 'taxrate' | 'mmemo' | 'spec' | 'hdenno' | 'hline' | 'mtax'> & {
  id: number;
  denno: number;
};
/** 保存時に仕入伝票（trsiiden）の更新へ渡す値。inday は日付文字列 */
export type SiidenSet = Pick<mwI.Siiden, 'vcode' | 'scode' | 'tcode' | 'dmemo' | 'gtotal' | 'tax' | 'total' | 'updated_by' | 'currency'> & {
  inday: string | null;
  updated_at: Date;
};

/** 新規登録時に仕入伝票（trsiiden）へ渡す値 */
export type SiidenNew = SiidenSet & { id: number; denno: number; created_at: Date; created_by: string };

interface AffectedRows { affected_rows: number }
/** get_siiden クエリの結果 */
interface SiidenResult { trsiiden_by_pk: mwI.Trsiiden | null }
/** upd_siiden ミューテーションの結果 */
export interface UpdSiidenResult { update_trsiiden: AffectedRows; delete_trsiimei: AffectedRows; insert_trsiimei: AffectedRows }
/** ins_siiden ミューテーションの結果 */
export interface InsSiidenResult { insert_trsiiden: AffectedRows; insert_trsiimei: AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class SiimeiService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  public siimei = new Array<mwI.Siimei>();; //読込時にfrmsiire⇒smeitblコンポーネントへ渡すときのみ使用
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  private GetTran = gql`
    query get_siiden($dno: Int!, $id: smallint!) {
      trsiiden_by_pk(denno: $dno, id: $id) {
        vcode
        inday
        scode
        tcode
        gtotal
        total
        dmemo
        created_at
        created_by
        updated_at
        updated_by
        currency
        trsiimeis {
          line
          inday
          gcode
          suu
          genka
          money
          taxrate
          mmemo
          spec
          mtax
          tsuu
          hdenno
          hline
          msgood {
            gtext
            unit
          }
        }
      }
    }`;
  qrySiiden(denno: number): Observable<mwI.Trsiiden | null> {
    let observable: Observable<mwI.Trsiiden | null> = new Observable<mwI.Trsiiden | null>(observer => {
      this.apollo.watchQuery<SiidenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data);
          observer.next((data as SiidenResult).trsiiden_by_pk);
          // return resolve(data.trhatden_by_pk);
        }, (error) => {
          // return reject(error);
          observer.error(error);
        });
    });
    return observable;
  }
  convHatmei(hdenno: number, hatmei: mwI.Trhatden['vhatzns']) {
    this.siimei = new Array<mwI.Siimei>();
    hatmei.forEach((e) => {
      // console.log(e);
      if (e.hatzn > 0) {
        this.siimei.push({
          line: e.line,
          gcode: e.gcode,
          suu: e.hatzn,
          genka: e.genka,
          money: e.money,
          taxrate: e.taxrate,
          mmemo: e.mmemo,
          spec: e.spec,
          hdenno: hdenno,
          hline: e.line,
          inday: '',
          mtax: e.mtax,
          msgood: {
            gtext: e.gtext,
            unit: e.msgood.unit
          }
          // currency:''
        });
      }
    });
  }

  updSiiden(denno: number, siiden: SiidenSet, siimei: SiimeiInput[]): Promise<UpdSiidenResult> {
    const UpdateTran = gql`
      mutation upd_siiden($id: smallint!, $hdno: Int!,$_set: trsiiden_set_input!,$obj:[trsiimei_insert_input!]!) {
        update_trsiiden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trsiimei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trsiimei(objects: $obj) {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<UpdSiidenResult>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: siiden,
          obj: siimei
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
        return resolve(data as UpdSiidenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  insSiiden(siiden: SiidenNew[], siimei: SiimeiInput[]): Promise<InsSiidenResult> {
    const InsertTran = gql`
      mutation ins_siiden($obj:[trsiiden_insert_input!]!,$objm:[trsiimei_insert_input!]!) {
        insert_trsiiden(objects: $obj)  {
          affected_rows
        }
        insert_trsiimei(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<InsSiidenResult>({
        mutation: InsertTran,
        variables: {
          obj: siiden,
          objm: siimei
        },
      }).subscribe(({ data }) => {
        return resolve(data as InsSiidenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }



}
