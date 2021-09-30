import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Injectable({
  providedIn: 'root'
})
export class HatmeiService {
  public hatmei: mwI.Hatmei[]=[]; //読込時にfrmsupply⇒hmeitblコンポーネントへ渡すときのみ使用
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
        dbiko
        inbiko
        created_at
        created_by
        tax
        updated_at
        updated_by
        hdstatus
        msvendor {
          mtax
          currency
        }
        trhatmeis {
          day
          gcode
          gtext
          inday
          jdenno
          jline
          line
          mbiko
          money
          spec
          genka
          suu
          taxrate
          yday
          ydaykbn
          mtax
        }
      }
    }`;

  constructor(public usrsrv: UserService,         
              private apollo: Apollo) { }

  qry_hatden(denno:number): Observable<mwI.Trhatden>{
    // console.log(denno);
    // return new Promise( (resolve,reject) => {
    let observable:Observable<mwI.Trhatden> = new Observable<mwI.Trhatden>(observer => {  
      this.apollo.watchQuery<any>({
        query: this.GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            dno: denno
          },
      })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        observer.next(data.trhatden_by_pk);
        // return resolve(data.trhatden_by_pk);
      },(error) => {
        // return reject(error);
        observer.error(error);
      });
    });
    return observable;
  }
  upd_hatden(denno,hatden,hatmei):Promise<string>{
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
    return new Promise( (resolve,reject) => {
      this.apollo.mutate<any>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: hatden,
          obj: hatmei
        },
        refetchQueries: [
          {query:  this.GetTran, 
            variables: { 
              id : this.usrsrv.compid,
              dno: denno},
          }],
      }).subscribe(({ data }) => { 
        return resolve(data);
      },(error) => {
        return reject(error);
      }); 
    });  
  }
  ins_hatden(hatden,hatmei):Promise<string>{
    const InsertTran = gql`
      mutation ins_hatden($obj:[trhatden_insert_input!]!,$objm:[trhatmei_insert_input!]!) {
        insert_trhatden(objects: $obj)  {
          affected_rows
        }
        insert_trhatmei(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise( (resolve,reject) => {
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          obj: hatden,
          objm: hatmei
        },
      }).subscribe(({ data }) => { 
        return resolve(data);
      },(error) => {
        return reject(error);
      }); 
    });  
  }
  get_hdsta(hmei):string {
    let flg0:boolean=false;//発注済
    let flg1:boolean=false;//入荷予定あり
    let flg2:boolean=false;//入荷確定あり
    let flg3:boolean=false;//仕入済あり
    let ret:string="";

    hmei.forEach(e => {
      if(e.inday){
        flg3=true;
      }else if(e.yday && e.ydaykbn=='0'){
        flg2=true;
      }else if(e.yday && e.ydaykbn=='1'){
        flg1=true;
      }else{
        flg0=true;
      } 
    });
    if(flg3 && !flg2 && !flg1 && !flg0){
      ret='5';
    }else if(flg3 && (flg2 || flg1 || flg0)){
      ret='4';
    }else if(flg2 && !flg1 && !flg0){
      ret='3';
    }else if(flg2 && (flg1 || flg0)){
      ret='2';
    }else{
      ret='1';
    }
    return ret;
  }
}
