import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';


export class Zaiko {
  scode!: string;
  gcode!: string;
  day!: string;
  movi!: number;
  movo!: number;
}
export class Gzai {
  zcode!: string;
  irisu!: number;
  msgoods!: {
        gskbn: string;
    };
  constructor(init?: Partial<Movden>) {
    Object.assign(this, init);
  }
}

export class Movden {
  line!: number;
  gcode!: string;
  suu!: number;
  pable!: number;
  stock!: number;
  memo!: string;
  jdenno!: number;
  jline!: number;
  kako!: string;
  msgood!: {
        gtext: string;
        unit: string;
        gskbn: string;
        msgzais: Gzai[];
    };
  constructor(init?: Partial<Movden>) {
    Object.assign(this, init);
  }
}



export class Movsub {
  day!: Date;
  incode!: string;
  outcode!: string;
  tcode!: string;
  omemo!: string;
  hday!: Date;
  htime!: string;
  hcode!: string;
  okurino!: number;
  okurisuu!: number;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  trmovdens!: Movden[];
  constructor(init?: Partial<Movsub>) {
    Object.assign(this, init);
  }
}

/** 保存時に移動伝票（trmovsub）の更新へ渡す値。day / hday は日付文字列（未入力は null） */
export type MovsubSet = Pick<Movsub, 'outcode' | 'incode' | 'tcode' | 'hcode' | 'htime' | 'okurisuu' | 'okurino' | 'omemo'> & {
  day: string | null;
  hday: string | null;
  dmemo: string;
  smemo: string;
  updated_at: Date;
  updated_by: string;
};
/** 保存時に移動明細（trmovden）へ渡す値 */
export interface MovmeiInput { id: number; denno: number; line: number; gcode: string; suu: number; memo: string }
/** 移動明細に商品（msgood）の情報が付いた形。読込時の Movden と同じ */
export type MovmeiWithGood = MovmeiInput & { msgood: Movden['msgood'] };

interface AffectedRows { affected_rows: number }
/** get_movden クエリの結果 */
interface MovdenResult { trmovsub_by_pk: Movsub | null }
/** upd_zaiko / ins_zaiko ミューテーションの結果 */
interface UpdZaikoResult { update_trzaiko: AffectedRows }
interface InsZaikoResult { insert_trzaiko: AffectedRows }
/** upd_movsub ミューテーションの結果 */
export interface UpdMovdenResult { update_trmovsub: AffectedRows; delete_trmovden: AffectedRows; insert_trmovden: AffectedRows }
/** ins_movsub ミューテーションの結果 */
export interface InsMovdenResult { insert_trmovsub: AffectedRows; insert_trmovden: AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class MovingService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

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
        omemo
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

  qryMovden(denno: number): Observable<Movsub | null> {
    let observable: Observable<Movsub | null> = new Observable<Movsub | null>(observer => {
      this.apollo.watchQuery<MovdenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          observer.next((data as MovdenResult).trmovsub_by_pk);
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  updZaiko(zai: Zaiko) {
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
    this.apollo.mutate<UpdZaikoResult>({
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
      if ((data as UpdZaikoResult).update_trzaiko.affected_rows == 0) {
        this.apollo.mutate<InsZaikoResult>({
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

  updMovden(denno: number, movsub: MovsubSet, movmei: MovmeiInput[]): Promise<UpdMovdenResult> {
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
      this.apollo.mutate<UpdMovdenResult>({
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
        return resolve(data as UpdMovdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  insMovden(movsub: Movsub[], movmei: MovmeiInput[]): Promise<InsMovdenResult> {
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
      this.apollo.mutate<InsMovdenResult>({
        mutation: InsertTran,
        variables: {
          obj: movsub,
          objm: movmei
        },
      }).subscribe(({ data }) => {
        return resolve(data as InsMovdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
}
