import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';


export class Zaiko {
  scode: string;
  gcode: string;
  day: string;
  movi: number;
  movo: number;
}
export class Gzai {
  zcode: string;
  irisu: number;
  msgoods: {
    gskbn: string;
  };
  constructor(init?: Partial<Movden>) {
    Object.assign(this, init);
  }
}

export class Movden {
  line: number;
  gcode: string;
  suu: number;
  pable: number;
  stock: number;
  memo: string;
  jdenno: number;
  jline: number;
  kako: string;
  msgood: {
    gtext: string;
    unit: string;
    gskbn: string;
    msgzais: Gzai[];
  }
  constructor(init?: Partial<Movden>) {
    Object.assign(this, init);
  }
}



export class Movsub {
  day: Date;
  incode: string;
  outcode: string;
  tcode: string;
  obikou: string;
  hday: Date;
  htime: string;
  hcode: string;
  okurino: number;
  okurisuu: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  trmovdens: Movden[];
  constructor(init?: Partial<Movsub>) {
    Object.assign(this, init);
  }
}

@Injectable({
  providedIn: 'root'
})
export class MovingService {
  // public movmei: Movden[] = []; //読込時にfrmsupply⇒hmeitblコンポーネントへ渡すときのみ使用
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  private GetTran = gql`
    query get_movden($dno: Int!, $id: smallint!) {
      trmovsub_by_pk(denno: $dno, id: $id) {
        day
        incode
        outcode
        tcode
        obikou
        hday
        htime
        hcode
        okurino
        okurisuu
        created_at
        created_by
        updated_at
        updated_by
        trmovdens {
          line
          gcode
          suu
          memo
          msgood {
            gtext
            unit
            gskbn
            msgzais {
              zcode
              irisu
              msgoods {
                gskbn
              }
            }
          }
        }
      }
    }`;

  constructor(public usrsrv: UserService,
    private apollo: Apollo) { }

  qryMovden(denno: number): Observable<Movsub> {
    let observable: Observable<Movsub> = new Observable<Movsub>(observer => {
      this.apollo.watchQuery<any>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          observer.next(data.trmovsub_by_pk);
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  updZaiko(zai: any) {
    const UpdateTran = gql`
      mutation upd_zaiko($id:smallint!,$scd:String!,$gcd:String!,$day:date!,$inc: trzaiko_inc_input!) {
        update_trzaiko(where:{id:{_eq:$id},scode:{_eq:$scd},gcode:{_eq:$gcd},day:{_eq:$day}}, _inc: $inc)  {
          affected_rows
        }
      }`;
    const InsertTran = gql`
      mutation ins_zaiko($obj:[trzaiko_insert_input!]!) {
        insert_trzaiko(objects: $obj) {
          affected_rows
        }
      }`;
    this.apollo.mutate<any>({
      mutation: UpdateTran,
      variables: {
        id: this.usrsrv.compid,
        scd: zai.scode,
        gcd: zai.gcode,
        day: zai.day,
        inc: { movi: zai.movi, movo: zai.movo }
      },
    }).subscribe(({ data }) => {
      // console.log(zai, data);
      if (data.update_trzaiko.affected_rows == 0) {
        this.apollo.mutate<any>({
          mutation: InsertTran,
          variables: {
            obj: [{
              id: this.usrsrv.compid,
              scode: zai.scode,
              gcode: zai.gcode,
              day: zai.day,
              movi: zai.movi,
              movo: zai.movo
            }]
          },
        }).subscribe(({ data }) => {
          console.log(zai, data);
        }, (error) => {
          console.log('ins_zaiko error', error);
        });
      }
    }, (error) => {
      console.log('upd_zaiko error', error);
    });
  }

  updMovden(denno, movsub, movmei): Promise<string> {
    const UpdateTran = gql`
      mutation upd_movsub($id: smallint!, $dno: Int!,$_set: trmovsub_set_input!,$obj:[trmovden_insert_input!]!) {
        update_trmovsub(where: {id: {_eq:$id},denno: {_eq:$dno}}, _set: $_set)  {
          affected_rows
        }
        delete_trmovden(where: {id: {_eq:$id},denno: {_eq:$dno}}) {
          affected_rows
        }
        insert_trmovden(objects: $obj) {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<any>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno,
          _set: movsub,
          obj: movmei
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
  insMovden(movsub, movmei): Promise<string> {
    const InsertTran = gql`
      mutation ins_movsub($obj:[trmovsub_insert_input!]!,$objm:[trmovden_insert_input!]!) {
        insert_trmovsub(objects: $obj)  {
          affected_rows
        }
        insert_trmovden(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          obj: movsub,
          objm: movmei
        },
      }).subscribe(({ data }) => {
        return resolve(data);
      }, (error) => {
        return reject(error);
      });
    });
  }
}
