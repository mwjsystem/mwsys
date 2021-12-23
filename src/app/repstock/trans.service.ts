import { Injectable } from '@angular/core';
import { UserService } from './../services/user.service';
import { MembsService } from './../services/membs.service';
import { BunruiService } from './../services/bunrui.service';
import { Subject, Observable } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

export class Trans {
  cday:Date;
  sday:Date;
  ttype:String;
  denno:number;
  line:number;
  memo:String;
  biko:String;
  tcode:String;
  yday:Date;
  aitec:number;
  aiten:String;
  insuu:number;
  ousuu:number;
  zaisu:number;
  yotei:number;
  wait:number;
  constructor(init?:Partial<Trans>) {
      Object.assign(this, init);
  }
}

@Injectable({
  providedIn: 'root'
})
export class TransService {
  public tbldata:Trans[]=[];
  public flg:number=1;
  //コンポーネント間通信用
  subject = new Subject<Trans[]>();
  observe = this.subject.asObservable();

  constructor(public usrsrv: UserService,
              public memsrv: MembsService,
              public bunsrv: BunruiService,          
              private apollo: Apollo) {                
               }

  async get_trans(gcd:string,scd:string,day:Date):Promise<Trans[]> {
    const GetTran = gql`
    query get_trans($id: smallint!, $gcd: String!, $scd: String!, $day: date!, $today: date!) {
      shukka:trjyumei(where: {id: {_eq: $id}, gcode: {_eq: $gcd},sday: {_gt: $day,_lte: $today}, scode: {_eq: $scd}}) {
        sday
        denno
        line
        spec
        spdet
        mbikou
        suu
        trjyuden{
          tcode
          mcode
        }
      }        
    }`; 
    let trans:Trans[]=[];
    return new Promise( resolve => {
      this.apollo.watchQuery<any>({
        query: GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            gcd: gcd,
            scd: scd,
            day: this.usrsrv.getLastMonth(new Date()),
            today:new Date()
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        data.shukka.forEach(e => {
          const tran:Trans={
            cday:e.sday,
            sday:e.sday,
            ttype:'出荷',
            denno:e.denno,
            line:e.line,
            memo:this.bunsrv.get_name(e.spec,'jmeikbn') + e.spdet,
            biko:e.mbiko,
            tcode:e.trjyuden.tcode,
            yday:null,
            aitec:e.trjyuden.mcode,
            aiten:this.memsrv.get_mcdtxt(e.trjyuden.mcode),
            insuu:null,
            ousuu:e.suu,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        });
        return resolve(trans);
      },(error) => {
        console.log('error query get_jyumei', error);
      });




      


    })


  }


}
