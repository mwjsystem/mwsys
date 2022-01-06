import { Injectable } from '@angular/core';
import { UserService } from './../services/user.service';
import { MembsService } from './../services/membs.service';
import { BunruiService } from './../services/bunrui.service';
import { StockService } from './../services/stock.service';
import { Subject, Observable } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

export class Trans {
  cday:String;
  sday:String;
  ttype:String;
  denno:number;
  line:number;
  biko:String;
  tcode:String;
  yday:String;
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
              public stcsrv: StockService,         
              private apollo: Apollo) {                
               }

  async get_trans(gcd:string,scd:string,day:Date):Promise<Trans[]> {
    const lcmago=this.usrsrv.getLastMonth(day);
    console.log(lcmago);
    let lcprms1:Promise<Trans[]>=new Promise( resolve => {
      this.stcsrv.get_stock(gcd,'0',scd,lcmago).then(e =>{
        // console.log('前残');
        let trans:Trans[]=[];  
          const tran:Trans={
            cday:this.usrsrv.formatDate(lcmago),
            sday:this.usrsrv.formatDate(lcmago),
            ttype:'前残',
            denno:null,
            line:null,
            biko:null,
            tcode:null,
            yday:null,
            aitec:null,
            aiten:null,
            insuu:e[0].stock,
            ousuu:null,
            zaisu:e[0].stock,
            yotei:null,
            wait:null
          };
        trans.push(tran);
        return resolve(trans);
      })
    })
    const GetTran = gql`
    query get_trans($id: smallint!, $gcd: String!, $scd: String!, $day: date!, $today: date!) {
      shukka:trjyumei(where: {id: {_eq: $id}, gcode: {_eq: $gcd},sday: {_gt: $day,_lte: $today}, scode: {_eq: $scd},trjyuden: {skbn: {_neq: "1"}}}) {
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
          msmember {
            sei
            mei
          }
        }
      } 
      siire:trsiimei(where: {id: {_eq: $id}, gcode: {_eq: $gcd},inday: {_gt: $day,_lte: $today}, scode: {_eq: $scd}}) {
        inday
        denno
        line
        spec
        mbiko
        suu
        trsiiden{
          tcode
          vcode
          msvendor {
            adrname
          }
        }
      } 
      movin:trmovden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},day: {_gt: $day,_lte: $today}, incode: {_eq: $scd}}) {
        day
        denno
        line
        memo
        outcode
        suu
        trmovsub{
          tcode
        }
        msstoreout{
          name
        }
      }  
      movout:trmovden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},day: {_gt: $day,_lte: $today}, outcode: {_eq: $scd}}) {
        day
        denno
        line
        memo
        incode
        suu
        trmovsub{
          tcode
        }
        msstorein{
          name
        }
      }
      tenmoto:trtenden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},day: {_gt: $day,_lte: $today}, scode: {_eq: $scd}, kubun: {_eq: 0}}) {
        day
        denno
        line
        memo
        suu
        tcode
      } 
      tensaki:trtenden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},day: {_gt: $day,_lte: $today}, scode: {_eq: $scd}, kubun: {_eq: 1}}) {
        day
        denno
        line
        memo
        suu
        tcode
      } 
      hikat:trjyumei(where: {id: {_eq: $id}, gcode: {_eq: $gcd}, _or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}], scode: {_eq: $scd}}) {
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
          yday
          msmember {
            sei
            mei
          }
        }
      }                   
    }`; 
    let lcprms2:Promise<Trans[]>= new Promise( resolve => {
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
        // console.log('出荷',data);
        let trans:Trans[]=[];
        data.shukka.forEach(e => {
          const tran:Trans={
            cday:e.sday,
            sday:e.sday,
            ttype:'出荷',
            denno:e.denno,
            line:e.line,
            biko:e.mbikou,
            tcode:e.trjyuden.tcode,
            yday:null,
            aitec:e.trjyuden.mcode,
            aiten:e.trjyuden.msmember.sei + (e.trjyuden.msmember.mei ?? ""),
            insuu:null,
            ousuu:e.suu,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        });
        data.siire.forEach(e => {
          const tran:Trans={
            cday:e.inday,
            sday:e.inday,
            ttype:'仕入',
            denno:e.denno,
            line:e.line,
            biko:e.mbiko,
            tcode:e.trsiiden.tcode,
            yday:null,
            aitec:e.trsiiden.vcode,
            aiten:e.trsiiden.msvendor.adrname,
            insuu:e.suu,
            ousuu:null,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        });        
        data.movin.forEach(e => {
          const tran:Trans={
            cday:e.day,
            sday:e.day,
            ttype:'移動入庫',
            denno:e.denno,
            line:e.line,
            biko:e.mbiko,
            tcode:e.trmovsub.tcode,
            yday:null,
            aitec:e.outcode,
            aiten:e.msstoreout.name,
            insuu:e.suu,
            ousuu:null,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        }); 
        data.movout.forEach(e => {
          const tran:Trans={
            cday:e.day,
            sday:e.day,
            ttype:'移動入庫',
            denno:e.denno,
            line:e.line,
            biko:e.mbiko,
            tcode:e.trmovsub.tcode,
            yday:null,
            aitec:e.incode,
            aiten:e.msstorein.name,
            insuu:null,
            ousuu:e.suu,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        }); 
        data.tenmoto.forEach(e => {
          const tran:Trans={
            cday:e.day,
            sday:e.day,
            ttype:'展開元',
            denno:e.denno,
            line:e.line,
            biko:e.memo,
            tcode:e.tcode,
            yday:null,
            aitec:null,
            aiten:null,
            insuu:null,
            ousuu:e.suu,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        }); 
        data.tensaki.forEach(e => {
          const tran:Trans={
            cday:e.day,
            sday:e.day,
            ttype:'展開先',
            denno:e.denno,
            line:e.line,
            biko:e.memo,
            tcode:e.tcode,
            yday:null,
            aitec:null,
            aiten:null,
            insuu:e.suu,
            ousuu:null,
            zaisu:null,
            yotei:null,
            wait:null
          };
          trans.push(tran);
        });
        // console.log(data);
        data.hikat.forEach(e => {
          const tran:Trans={
            cday:e.trjyuden.yday,
            sday:e.sday,
            ttype:'引当済',
            denno:e.denno,
            line:e.line,
            biko:e.mbikou,
            tcode:e.trjyuden.tcode,
            yday:e.trjyuden.yday,
            aitec:e.trjyuden.mcode,
            aiten:e.trjyuden.msmember.sei + (e.trjyuden.msmember.mei ?? ""),
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
      return new Promise( resolve => {
        Promise.all([lcprms1,lcprms2]).then( result => {
          let trans:Trans[]=[];
          result.forEach(element => {
            // console.log('Promise.all',element);
            trans=trans.concat(element);
          });
          return resolve(this.sort_tblData(trans));
        })
      })
  }

  sort_tblData(tbldata): Promise<Trans[]> {
    return new Promise( resolve => {
      tbldata.sort(function(a, b) {
        if (a.cday > b.cday) {
          return 1;
        } else {
          return -1;
        } 
      })
      let wGenz:number=0;
      for (let i=0; i < tbldata.length; i++ ){
        wGenz += tbldata[i].insuu - tbldata[i].ousuu;
        tbldata[i].zaisu = wGenz;
      }
      if (this.flg==-1) {
          tbldata.sort(function(a, b) {
          if (a.cday < b.cday) {
            return 1;
          } else {
            return -1;
          } 
        })
      }
      return resolve(tbldata);
    })
  } 
}
