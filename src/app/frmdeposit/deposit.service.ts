import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

export class Nyuden {
  line: number;
  ptype: string;
  nmoney: number;
  smoney: number;
  tmoney: number;
  total: number;
  mmemo: string;
}

export class Nyusub {
  denno: number;
  kubun: number;
  day: Date;
  mcode: string;
  code: string;
  tcode: string;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  memo: string;
  jdenno: number;
  idenno: number;
  nmoney: number;
  smoney: number;
  tmoney: number;
  trnyudens: Nyuden[];
}

export class Nyuhis {
  denno: number;
  day: Date;
  nmoney: number;
  smoney: number;
  tmoney: number;
  total: number;
  memo: string;
}



export class Jyuden {
  day: Date;
  uday: Date;
  nday: Date;
  scde: string;
  hcode: string;
  okurino: String;
  total: number;
  torikbn: boolean;
  idenno: number;
  daibiki: number;
  tcode: String;
  tcode1: String;
  nyukin: number;
  shukin: number;
  chosei: number;
  nyuzan: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  trnyusubs: Nyusub[];
  constructor(init?: Partial<Jyuden>) {
    Object.assign(this, init);
    this.total = 0;
    this.nyuzan = 0;
  }
}

@Injectable({
  providedIn: 'root'
})
export class DepositService {
  total: number = 0;
  mode: number = 3;
  nyusub: Nyusub[] = [];
  nyuden: Nyuden[] = [];
  public subHis = new Subject<Nyuhis[]>();
  public observeH = this.subHis.asObservable();
  public subDep = new Subject<boolean>();
  public observeD = this.subDep.asObservable();

  private GetTran0 = gql`
    query get_nyuden($dno: Int!, $id: smallint!) {
      trnyusub(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
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
        jdenno
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
        vnyuzan {
          trnyusubs {
            denno
            day
            nmoney
            smoney
            tmoney
            updated_at
          }
        }
      }
    }`;

  private GetTran = gql`
    query get_jyuden($dno: Int!, $id: smallint!) {
      vnyuzan(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
        day
        uday
        nday
        scde
        hcode
        okurino
        total
        torikbn
        idenno
        daibiki
        tcode
        tcode1
        nyukin
        shukin
        chosei
        nyuzan
        trnyusubs {
          denno
          day
          nmoney
          smoney
          tmoney
          updated_at
        }
      }
    }`;

  constructor(public usrsrv: UserService,
    private apollo: Apollo) { }

  qryJyuden(denno: number): Observable<Jyuden> {
    let observable: Observable<Jyuden> = new Observable<Jyuden>(observer => {
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
          if (data.vnyuzan.length == 0) {
            observer.error('受注伝票' + denno + 'は未登録です');

          } else if (data.vnyuzan[0].torikbn == true) {
            observer.error('締請求の伝票です');
          } else {
            observer.next(data.vnyuzan[0]);
          }
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  qryNyuden(denno: number): Observable<Nyusub> {
    let observable: Observable<Nyusub> = new Observable<Nyusub>(observer => {
      this.apollo.watchQuery<any>({
        query: this.GetTran0,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          observer.next(data.trnyusub[0]);
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }
  updNyuden(denno, nyusub, dept): Promise<string> {
    const UpdateTran = gql`
      mutation upd_nyusub($id: smallint!, $dno: Int!,$_set: trnyusub_set_input!,$obj:[trnyuden_insert_input!]!) {
        update_trnyusub(where: {id: {_eq:$id},denno: {_eq:$dno}}, _set: $_set)  {
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
      this.apollo.mutate<any>({
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
  insNyuden(nyusub, dept): Promise<string> {
    const InsertTran = gql`
      mutation ins_nyuden($obj:[trnyusub_insert_input!]!,$objm:[trnyuden_insert_input!]!) {
        insert_trnyusub(objects: $obj)  {
          affected_rows
        }
        insert_trnyuden(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          obj: nyusub,
          objm: dept
        },
      }).subscribe(({ data }) => {
        return resolve(data);
      }, (error) => {
        return reject(error);
      });
    });
  }
}
