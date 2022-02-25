import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Injectable({
  providedIn: 'root'
})
export class SiimeiService {
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
        dbiko
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
          mbiko
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

  constructor(public usrsrv: UserService,
    private apollo: Apollo) { }
  qry_siiden(denno: number): Observable<mwI.Trsiiden> {
    let observable: Observable<mwI.Trsiiden> = new Observable<mwI.Trsiiden>(observer => {
      this.apollo.watchQuery<any>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data);
          observer.next(data.trsiiden_by_pk);
          // return resolve(data.trhatden_by_pk);
        }, (error) => {
          // return reject(error);
          observer.error(error);
        });
    });
    return observable;
  }
  convHatmei(hdenno, hatmei) {
    this.siimei = new Array<mwI.Siimei>();
    hatmei.forEach(e => {
      // console.log(e);
      if (e.hatzn > 0) {
        this.siimei.push({
          line: e.line,
          gcode: e.gcode,
          suu: e.hatzn,
          genka: e.genka,
          money: e.money,
          taxrate: e.taxrate,
          mbiko: e.mbiko,
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

  upd_siiden(denno, siiden, siimei): Promise<string> {
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
      this.apollo.mutate<any>({
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
        return resolve(data);
      }, (error) => {
        return reject(error);
      });
    });
  }
  ins_siiden(siiden, siimei): Promise<string> {
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
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          obj: siiden,
          objm: siimei
        },
      }).subscribe(({ data }) => {
        return resolve(data);
      }, (error) => {
        return reject(error);
      });
    });
  }



}
