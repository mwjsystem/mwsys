import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { OkuriService } from './../services/okuri.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Injectable({
  providedIn: 'root'
})
export class JyumeiService {
  public jyumei: mwI.Jyumei[]=[]; //読込時にfrmsales⇒jmeitblコンポーネントへ渡すときのみ使用
  public denno:number=0;
  public mtax:string;             //顧客マスタ「税区分」
  public tankakbn:string;         //顧客マスタ「単価区分」
  public sptnkbn:string;          //顧客マスタ「特別単価区分」
  // public souko:string;
  public ntype:number;            //顧客マスタ「納品書タイプ」
  public tntype:number;           //顧客マスタ「直送納品書タイプ」
  public address:string="";
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  
  private GetTran = gql`
    query get_jyuden($id: smallint!,$dno: Int!) {
      trjyuden_by_pk(denno: $dno, id: $id) {
        denno
        jdstatus
        jdshsta
        torikbn
        created_at
        created_by
        updated_at
        updated_by
        mcode
        scde
        ncode
        nadr
        bunsho
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
        bikou
        nbikou
        obikou
        sbikou
        cusden
        ryoate
        daibiki
        daibunrui
        chubunrui
        shobunrui
        tcode1
        gtotalzn
        souryouzn
        tesuuzn
        nebikizn
        taxtotal
        total
        genka
        hgenka
        egenka
        trjyumeis(order_by: {line: asc}) {
          line
          gcode
          gtext
          suu
          tanka
          tinmoney
          mbikou
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
          msgood {
            gskbn
            unit
            max
            koguchi
            ordering
            send
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
        }
      }
    }`;
  
  constructor(private usrsrv: UserService,  
              private okrsrv: OkuriService,       
              private apollo: Apollo,
              private toastr: ToastrService) { }
  
  qry_jyuden(denno:number): Observable<mwI.Trjyuden>{
    let observable:Observable<mwI.Trjyuden> = new Observable<mwI.Trjyuden>(observer => {  
      this.apollo.watchQuery<any>({
        query: this.GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            dno: denno
          },
      })
      .valueChanges
      .subscribe(({ data }) => {
        observer.next(data.trjyuden_by_pk);
      },(error) => {
        observer.error(error);
      });
    });
    return observable;
  }
  async get_denno(){
    // console.log(this.denno,this.denno==0); 
    // let observable:Observable<number> = new Observable<number>(observer => {
      // console.log(this.denno,this.denno==0); 
      if (this.denno==0) {  
        // console.log(this.denno,this.denno==0);   
        return await this.usrsrv.getNumber('jdenno',1);
      }else{
        // console.log(this.denno,this.denno==0);
        return this.denno;
      }
    // });
  }
  edit_jyumei(data:any[]){
    data.forEach(element => {
      // console.log(element);
      let {msgood,...rest} = element;
      let {msggroup,...rest2} = msgood;
      // console.log(rest,rest2);
      this.jyumei.push({...msggroup, ...rest, ...rest2});
    });
    // console.log(this.jyumei);
  }
  upd_jyuden(denno,jyuden,jyumei):Promise<string>{
    const UpdateTran = gql`
      mutation upd_jyuden($id: smallint!, $hdno: Int!,$_set: trjyuden_set_input!,$obj:[trjyumei_insert_input!]!) {
        update_trjyuden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trjyumei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trjyumei(objects: $obj) {
          affected_rows
        }
      }`;
    return new Promise( (resolve,reject) => {
      this.apollo.mutate<any>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: jyuden,
          obj: jyumei
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
  
  ins_jyuden(jyuden,jyumei):Promise<string>{
    const InsertTran = gql`
      mutation ins_jyuden($obj:[trjyuden_insert_input!]!,$objm:[trjyumei_insert_input!]!) {
        insert_trjyuden(objects: $obj)  {
          affected_rows
        }
        insert_trjyumei(objects: $objm)  {
          affected_rows
        }
      }`;
    return new Promise( (resolve,reject) => {
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          obj: jyuden,
          objm: jyumei
        },
      }).subscribe(({ data }) => { 
        return resolve(data);
      },(error) => {
        return reject(error);
      }); 
    });  
  }

  get_jdsta(hmei):string {  
        
    let ret:string="";
    
    return ret;
  }

  async check_amazon(hcode,pOkrno:string):Promise<string> {  
    const CheckOkrno = gql`
      query get_jyuden($okrno: String!) {
        trjyuden(where: {id: {_eq: 1}, mcode: {_eq: "408223"}, okurino: {_eq: $okrno}}) {
          denno
        }
      }`;
    return new Promise( resolve => {
      this.apollo.watchQuery<any>({
        query :CheckOkrno,
        variables: {
          okrno: pOkrno
        },
      })
      .valueChanges
      .subscribe(({ data }) => { 
        // console.log(pOkrno,data); 
        if(data.trjyuden.length==0){
          return resolve(pOkrno);
        }else{
          this.okrsrv.set_okurino(hcode).then(value => this.check_amazon(hcode,value));         
        }
      });
    });
  }
}