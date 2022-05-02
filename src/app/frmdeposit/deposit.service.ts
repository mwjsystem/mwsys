import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

export class Jyuden {
  day: Date;
  sday: Date;
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
  constructor(init?: Partial<Jyuden>) {
    Object.assign(this, init);
  }
}

@Injectable({
  providedIn: 'root'
})
export class DepositService {
  total: number = 0;
  mode: number = 3;

  private GetTran = gql`
    query get_jyuden($dno: Int!, $id: smallint!) {
      vnyuzan(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
        day
        sday
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
      }
    }`;

  constructor(public usrsrv: UserService,
    private apollo: Apollo) { }

  qry_jyuden(denno: number): Observable<Jyuden> {
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
          if (data.vnyuzan[0].torikbn == true) {
            observer.error('締請求の伝票です');
            // } else if (!data.vnyuzan[0].idenno) {
            //   observer.error('請求処理済伝票です');
          } else {
            observer.next(data.vnyuzan[0]);
          }
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }
}
