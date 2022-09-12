import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

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
  gskbn: string;
  msgood: {
    gtext: string;
    unit: string;
  }
  msgzais: Gzai[];
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

  qry_movden(denno: number): Observable<Movsub> {
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
}
