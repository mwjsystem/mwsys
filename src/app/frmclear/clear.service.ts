import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 請求入金明細（trnyuden、kubun=1）の 1 行 */
export class Seiden {
  line!: number;
  ptype!: string;
  nmoney!: number;
  smoney!: number;
  tmoney!: number;
  total!: number;
  mmemo!: string;
}

/** 請求入金伝票（trnyusub、kubun=1）のヘッダ */
export class Seisub {
  denno!: number;
  kubun!: number;
  day!: Date;
  mcode!: string;
  code!: string;
  tcode!: string;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  memo!: string;
  idenno!: number;
  nmoney!: number;
  smoney!: number;
  tmoney!: number;
  trnyudens!: Seiden[];
}

/** 他の入金済み請求入金伝票一覧の 1 行 */
export class Seihis {
  denno!: number;
  day!: Date;
  nmoney!: number;
  smoney!: number;
  tmoney!: number;
  total!: number;
  memo!: string;
}

/** 対象の請求（trseikyu、月次締め）のヘッダ */
export class Seikyu {
  denno!: number;
  mcode!: string;
  sday!: Date;
  zenkai: number = 0;
  nmon: number = 0;
  tmon: number = 0;
  taxmon: number = 0;
  tax: number = 0;
  seikyu: number = 0;
  bcode!: string;
  constructor(init?: Partial<Seikyu>) {
    Object.assign(this, init);
  }
}

/** 保存時に請求入金明細（trnyuden）へ渡す値。day は日付文字列（未入力は null） */
export type ClearInput = Pick<Seiden, 'line' | 'ptype' | 'nmoney' | 'smoney' | 'tmoney' | 'mmemo'> & {
  id: number;
  kubun: number;
  denno: number;
  day: string | null;
};
/** 保存時に請求入金伝票（trnyusub）の更新へ渡す値 */
export type SeisubSet = Pick<Seisub, 'day' | 'mcode' | 'code' | 'idenno' | 'tcode' | 'updated_at' | 'updated_by'>;
/** 新規登録時に請求入金伝票（trnyusub）へ渡す値 */
export type SeisubNew = SeisubSet & Pick<Seisub, 'denno' | 'created_at' | 'created_by'> & { id: number; kubun: number };

/** get_seikyu クエリの結果（対象の請求＝月次締め） */
interface SeikyuResult { trseikyu: Seikyu[] }
/** get_seinyu クエリの結果 */
interface SeisubResult { trnyusub: Seisub[] }
/** get_seihis クエリの結果（他の入金済み請求入金伝票一覧） */
interface SeihisResult { trnyusub: Seihis[] }
/** upd_seinyu ミューテーションの結果 */
export interface UpdSeinyuResult { update_trnyusub: mwI.AffectedRows; delete_trnyuden: mwI.AffectedRows; insert_trnyuden: mwI.AffectedRows }
/** ins_seinyu ミューテーションの結果 */
export interface InsSeinyuResult { insert_trnyusub: mwI.AffectedRows; insert_trnyuden: mwI.AffectedRows }

@Injectable({
  providedIn: 'root'
})
export class ClearService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  total: number = 0;
  mode: number = 3;
  nyusub: Seisub[] = [];
  nyuden: Seiden[] = [];
  public subHis = new Subject<Seihis[]>();
  public observeH = this.subHis.asObservable();
  public subDep = new Subject<boolean>();
  public observeD = this.subDep.asObservable();

  private GetTran0 = gql`
    query get_seinyu($dno: Int!, $id: smallint!) {
      trnyusub(where: {id: {_eq: $id}, denno: {_eq: $dno}, kubun: {_eq: 1}}) {
        kubun
        day
        mcode
        tcode
        code
        memo
        created_at
        created_by
        updated_at
        updated_by
        idenno
        nmoney
        smoney
        tmoney
        trnyudens {
          line
          ptype
          nmoney
          smoney
          tmoney
          mmemo
        }
      }
    }`;

  private GetTran = gql`
    query get_seikyu($dno: Int!, $id: smallint!) {
      trseikyu(where: {id: {_eq: $id}, denno: {_eq: $dno}, del: {_eq: false}}) {
        denno
        mcode
        sday
        zenkai
        nmon
        tmon
        taxmon
        tax
        seikyu
        bcode
      }
    }`;

  private GetHis = gql`
    query get_seihis($dno: Int!, $id: smallint!) {
      trnyusub(where: {id: {_eq: $id}, idenno: {_eq: $dno}, kubun: {_eq: 1}}) {
        denno
        day
        nmoney
        smoney
        tmoney
        memo
      }
    }`;

  qrySeikyu(denno: number | string): Observable<Seikyu> {
    let observable: Observable<Seikyu> = new Observable<Seikyu>(observer => {
      this.apollo.watchQuery<SeikyuResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          if (!data) {
            return;
          }
          const result = data as SeikyuResult;
          if (result.trseikyu.length == 0) {
            observer.error('請求伝票' + denno + 'は未登録か取消済です');
          } else {
            observer.next(new Seikyu(result.trseikyu[0]));
          }
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  qrySeihis(idenno: number | string): Observable<Seihis[]> {
    let observable: Observable<Seihis[]> = new Observable<Seihis[]>(observer => {
      this.apollo.watchQuery<SeihisResult>({
        query: this.GetHis,
        variables: {
          id: this.usrsrv.compid,
          dno: idenno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          if (!data) {
            return;
          }
          observer.next((data as SeihisResult).trnyusub.map(e => ({
            denno: e.denno,
            day: e.day,
            nmoney: e.nmoney,
            smoney: e.smoney,
            tmoney: e.tmoney,
            total: e.nmoney - e.smoney + e.tmoney,
            memo: e.memo
          })));
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  qryNyuden(denno: number): Observable<Seisub | undefined> {
    let observable: Observable<Seisub | undefined> = new Observable<Seisub | undefined>(observer => {
      this.apollo.watchQuery<SeisubResult>({
        query: this.GetTran0,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          observer.next(data ? (data as SeisubResult).trnyusub[0] : undefined); // 伝票が無いときは undefined
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  updNyuden(denno: number, nyusub: SeisubSet, dept: ClearInput[]): Promise<UpdSeinyuResult> {
    const UpdateTran = gql`
      mutation upd_seinyu($id: smallint!, $dno: Int!,$_set: trnyusub_set_input!,$obj:[trnyuden_insert_input!]!) {
        update_trnyusub(where: {id: {_eq:$id},denno: {_eq:$dno},kubun: {_eq:1}}, _set: $_set)  {
          affected_rows
        }
        delete_trnyuden(where: {id: {_eq:$id},denno: {_eq:$dno}}) {
          affected_rows
        }
        insert_trnyuden(objects: $obj) {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<UpdSeinyuResult>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno,
          _set: nyusub,
          obj: dept
        },
        refetchQueries: [
          {
            query: this.GetTran,
            variables: {
              id: this.usrsrv.compid,
              dno: nyusub.idenno
            },
          }],
      }).subscribe(({ data }) => {
        return resolve(data as UpdSeinyuResult);
      }, (error) => {
        return reject(error);
      });
    });
  }

  insNyuden(nyusub: SeisubNew[], dept: ClearInput[]): Promise<InsSeinyuResult> {
    const InsertTran = gql`
      mutation ins_seinyu($obj:[trnyusub_insert_input!]!,$objm:[trnyuden_insert_input!]!) {
        insert_trnyusub(objects: $obj)  {
          affected_rows
        }
        insert_trnyuden(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<InsSeinyuResult>({
        mutation: InsertTran,
        variables: {
          obj: nyusub,
          objm: dept
        },
      }).subscribe(({ data }) => {
        return resolve(data as InsSeinyuResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
}
