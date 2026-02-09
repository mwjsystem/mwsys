import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
// import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { OkuriService } from './../services/okuri.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Injectable({
  providedIn: 'root'
})
export class JyumeiService {
  // public jyumei: mwI.Jyumei[] = []; //frmsales⇒jmeitblコンポーネントへ渡すときのみ使用
  public trjyumei = [];
  public trjmzai = [];
  public denno: number = 0;
  public mtax: string;             //顧客マスタ「税区分」
  public tankakbn: string;         //顧客マスタ「単価区分」
  public sptnkbn: string;          //顧客マスタ「特別単価区分」
  // public souko:string;
  public ntype: string;            //顧客マスタ「納品書タイプ」
  public tntype: string;           //顧客マスタ「直送納品書タイプ」
  public address: string = "";
  public dmemo: string = "";
  public iaddress: string = "";
  public trzaiko: mwI.Zaiko[] = [];
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  public isSaving: boolean;

  private GetTran = gql`
    query get_jyuden($id: smallint!,$dno: Int!) {
      trjyuden_by_pk(denno: $dno, id: $id) {
        denno
        jdstatus
        torikbn
        created_at
        created_by
        updated_at
        updated_by
        del
        mcode
        scde
        ncode
        nadr
        buntype
        day
        yday
        sday
        uday
        nday
        tcode
        scode
        skbn
        jcode
        pcode
        hcode
        hday
        htime
        okurisuu
        okurino
        dmemo
        nmemo
        omemo
        smemo
        cusden
        ryoate
        daibiki
        daibunrui
        chubunrui
        shobunrui
        tcode1
        gtotalzn
        soryozn
        tesuzn
        nebikizn
        taxtotal
        total
        genka
        hgenka
        egenka
        iadr
        total8
        total10
        dokono
        daibzei
		vnyuzan {
          nyuzan
        }
        trjyumeis(order_by: {line: asc}) {
          line
          gcode
          gtext
          suu
          tanka
          toutmoney
          tinmoney
          mmemo
          spec
          spdet
          genka
          scode
          sday
          tanka1
          money
          mtax
          tgenka
          taxmoney
          taxrate
          gskbn
          currency
          msgood {
            unit
            max
            koguchi
            ordering
            send
            hgcode
            tanano
            msggroup {
              vcode
              gkbn
              code
            }
            msgzais {
              zcode
              irisu
              msgoods {
                gskbn
              }
            }
          }
          trjyumzais {
            eda
            gcode
            suu
            spec
            spdet
          }
        }
      }
    }`;

  constructor(private usrsrv: UserService,
    private okrsrv: OkuriService,
    private apollo: Apollo
    // private toastr: ToastrService
  ) { }

  qryJyuden(denno: number): Observable<mwI.Trjyuden> {
    let observable: Observable<mwI.Trjyuden> = new Observable<mwI.Trjyuden>(observer => {
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
          observer.next(data.trjyuden_by_pk);
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }
  async getDenno() {
    if (this.denno == 0) {
      return await this.usrsrv.getNumber('jdenno', 1);
    } else {
      return this.denno;
    }
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
        inc: { syuk: zai.suu }
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
              syuk: zai.suu
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

  updJyuden(denno, jyuden, jyumei, jyumzai): Promise<string> {
    const UpdateTran = gql`
      mutation upd_jyuden($id: smallint!, $hdno: Int!,$_set: trjyuden_set_input!,$obj:[trjyumei_insert_input!]!,$obj2:[trjyumzai_insert_input!]!) {
        update_trjyuden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trjyumei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trjyumei(objects: $obj) {
          affected_rows
        }
        delete_trjyumzai(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trjyumzai(objects: $obj2) {
          affected_rows
        }      
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<any>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: jyuden,
          obj: jyumei,
          obj2: jyumzai
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

  insJyuden(jyuden, jyumei, jyumzai): Promise<string> {
    const InsertTran = gql`
      mutation ins_jyuden($obj:[trjyuden_insert_input!]!,$objm:[trjyumei_insert_input!]!,$obj2:[trjyumzai_insert_input!]!) {
        insert_trjyuden(objects: $obj)  {
          affected_rows
        }
        insert_trjyumei(objects: $objm)  {
          affected_rows
        }
        insert_trjyumzai(objects: $obj2) {
          affected_rows
        }  
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          obj: jyuden,
          objm: jyumei,
          obj2: jyumzai
        },
      }).subscribe(({ data }) => {
        return resolve(data);
      }, (error) => {
        return reject(error);
      });
    });
  }

  delJyuden(denno, flg): void {
    const DeleteTran = gql`
      mutation del_jyuden($id: smallint!, $dno: Int!, $flg: Boolean, $uat: timestamptz!, $uby: String!) {
        update_trjyuden(where: {id: {_eq:$id},denno: {_eq:$dno}}, _set: {del: $flg, updated_at: $uat, updated_by: $uby})  {
          affected_rows
        }
      }`;

    this.apollo.mutate<any>({
      mutation: DeleteTran,
      variables: {
        id: this.usrsrv.compid,
        dno: denno,
        flg: flg,
        uat: new Date(),
        uby: this.usrsrv.staff.code
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
      this.usrsrv.toastSuc('受注伝票' + denno + 'を変更しました');
      this.trzaiko.forEach(e => {
        if (flg = false) {
          e.suu = e.suu * -1;
        }
        this.updZaiko(e);
      });
    }, (error) => {
      this.usrsrv.toastErr('データベースエラー', '受注伝票' + denno + 'の取消(解除)ができませんでした');
      console.log('error del_jyuen', error);
    });
  }

  getJdsta(hmei): string {

    let ret: string = "";

    return ret;
  }

  async checkAmazon(hcode, pOkrno: string): Promise<string> {
    const CheckOkrno = gql`
      query get_jyuden($okrno: String!) {
        trjyuden(where: {id: {_eq: 1}, mcode: {_eq: "408223"}, okurino: {_eq: $okrno}}) {
          denno
        }
      }`;
    return new Promise(resolve => {
      this.apollo.watchQuery<any>({
        query: CheckOkrno,
        variables: {
          okrno: pOkrno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(pOkrno,data); 
          if (data.trjyuden.length == 0) {
            return resolve(pOkrno);
          } else {
            this.okrsrv.setOkurino(hcode).then(value => this.checkAmazon(hcode, value));
          }
        });
    });
  }
}