import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';
import { SoukoService } from './souko.service';
import { Subject, Observable } from 'rxjs';

export class Stock {
  gcode: string;
  scode: string;
  stock: number;
  hikat: number;
  juzan: number;
  today: number;
  keepd: number;
  constructor(init?:Partial<Stock>) {
    Object.assign(this, init);
  }
}

export class StGds {
  gcode: string;
  gtext: string;
  gskbn: string;
  yday: Date;
  suu: number;
  htzan: number;
  moavg: number;
  unit: string; 
  motai: string;
  ydtxt:string;
  stcks:Stock[];
  constructor(init?:Partial<StGds>) {
    Object.assign(this, init);
    this.ydtxt='入荷予定日';
  }
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  public stgds: StGds=new StGds();
  public stc: Stock=new Stock();
  public stcs: Stock[]=[];
  public shcnt:number[] =[0,0,0,0,0,0,0,0,0,0,0,0];
  public shlas:number[] =[0,0,0,0,0,0,0,0,0,0,0,0];
  public shavg:number =0;
  public shsak:number =0;
  private shcym:string[]=[];
  private shlym:string[]=[];
  public paabl:number = 0;
  public gcode:string;
  // // public subject = new Subject<Stock[]>();
  // public subject = new Subject<Stock>();
  // public observe = this.subject.asObservable();  
  constructor(public usrsrv: UserService,
              public soksrv: SoukoService,
              private apollo: Apollo) {
                this.make_yyyymm();
             }
  
  make_yyyymm(){
    let date = new Date();
    for (let i=1;i<13;i++){
      date.setMonth(date.getMonth()-1);
      this.shcym.push(this.usrsrv.toYYYYMM(date));
    }
    for (let i=1;i<13;i++){
      date.setMonth(date.getMonth()-1);
      this.shlym.push(this.usrsrv.toYYYYMM(date));
    }
    // console.log(this.shcym,this.shlym);
  }

  get_shcount(gcd:string):Promise<Stock[]>{
    this.gcode=gcd;
    
    const GetTran = gql`
    query get_shcount($id: smallint!, $gcode: String!, $fr: String!, $to: String!) {
      vshukka(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, to_char: {_gte: $fr, _lte: $to}}, order_by: {to_char: asc}) {
        gcode
        to_char
        sum
      }
      trhatmei(where: {hatzan: {_gt: 0}, id: {_eq: $id}, gcode: {_eq: $gcode}}, order_by: {inday: asc_nulls_last}) {
        gcode
        yday
        ydaykbn
        hatzan
      }
      trhatmei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}}) {
        aggregate {
          sum {
            hatzan
          }
        }
      }
    }`;
    this.stgds=new StGds();
    this.apollo.watchQuery<any>({
      query: GetTran, 
        variables: { 
          id : this.usrsrv.compid,
          gcode:gcd,
          fr:this.shlym[11],
          to:this.shcym[0]
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        for(let i=0;i<12;i++){
          const j:number= data.vshukka.findIndex(obj => obj.to_char == this.shcym[i]);
          if(j>-1){
            this.shcnt[i]=data.vshukka[j].sum;
          }else{
            this.shcnt[i]=0;
          }
          const k:number= data.vshukka.findIndex(obj => obj.to_char == this.shlym[i]);
          if(k>-1){
            this.shlas[i]=data.vshukka[k].sum;
          }else{
            this.shlas[i]=0;
          }
        }
        this.stgds.moavg = this.shcnt.reduce((a,b)=>{return a+b;}) / 12;
        const las:number =  this.shlas.reduce((a,b)=>{return a+b;});
        if(las==0){
          this.stgds.motai = '－';
        } else {
          this.stgds.motai = Math.round(this.shcnt.reduce((a,b)=>{return a+b;}) / las * 1000 ) / 10 + '％';
        }
        if(data.trhatmei.length>0){
          this.stgds.yday = data.trhatmei[0]?.yday;
          this.stgds.suu = data.trhatmei[0]?.hatzan;
          if(data.trhatmei[0]?.ydaykbn==0){
            this.stgds.ydtxt='入荷予定日(確定)';
          } else if(data.trhatmei[0]?.ydaykbn==1){
            this.stgds.ydtxt='入荷予定日(仮確定)';
          } else if(data.trhatmei[0]?.ydaykbn==2){
            this.stgds.ydtxt='暫定入荷予定日';
          } else {
            this.stgds.ydtxt='入荷予定日';
          }
        }else{
          this.stgds.yday = null;
          this.stgds.suu = 0;
          this.stgds.ydtxt='入荷予定日';
        }
        this.stgds.htzan=data.trhatmei_aggregate.aggregate.sum.hatzan;
        // console.log(this.shcnt,this.shlas);
      },(error) => {
        console.log('error query get_shcount', error);
      });

    const GetMast = gql`
    query get_gcdscd($id:smallint!,$gcode:String!) {
      vgstana(where:{id:{_eq:$id},gcode: {_eq:$gcode}}) {
        code
        gcode
        gskbn
        gtext
        unit
        tana
        day
      }
    }`;
    return new Promise( resolve => {
      this.apollo.watchQuery<any>({
        query: GetMast, 
          variables: { 
            id : this.usrsrv.compid,
            gcode:gcd
          },
        })
        .valueChanges
        .subscribe(({ data }) => { 
          // console.log(data);
          this.stgds.gtext=data.vgstana[0].gtext;
          this.stgds.gskbn=data.vgstana[0].gskbn;
          this.stgds.unit=data.vgstana[0].unit;
          this.stcs=[];
          Promise.all(data.vgstana.map(async item => {
            // console.log(item);
            let lcday:Date = item.day ?? new Date('2000-01-01');
            let lctana:number = item.tana ?? 0;          
            let lcstc= await this.get_zaiko(gcd,item.code,lcday,lctana);
            this.stcs.push(lcstc); 
          })).then(() => {
            return resolve(this.stcs);
          });
        },(error) => {
          console.log('error query get_shcount', error);
          return resolve(this.stcs);
        }); 
      });
 

  }

  async get_zaiko(gcd:string,scd:string,day:Date,stc:number):Promise<Stock>  {
    const GetTran = gql`
    query get_trgtana($id: smallint!, $gcode: String!, $scode: String!, $day: date!) {
      trzaiko_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, day: {_gt: $day}}) {
        aggregate {
          sum {
            haki
            hnyu
            jyut
            movi
            movo
            nyuk
            syuk
            teni
            teno
            hkat
          }
        }
      }      
    }`;    

    return new Promise<Stock>( resolve => {
      this.apollo.watchQuery<any>({
        query: GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            gcode: gcd,
            scode: scd,
            day: day
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        const lcsum = data.trzaiko_aggregate.aggregate.sum;
        let lcstcs:Stock={
          gcode: gcd,
          scode: scd,
          stock: stc + lcsum?.hnyu + lcsum?.movi - lcsum?.movo + lcsum?.nyuk - lcsum?.syuk + lcsum?.teni - lcsum?.teno - lcsum?.haki,
          hikat: lcsum?.hkat - lcsum?.syuk,
          juzan: lcsum?.jyut - lcsum?.syuk,
          today:0,
          keepd:0
        }
        return resolve(lcstcs);

      },(error) => {
        console.log('error query get_zaiko', error);
      });
    });
  }

  get_paabl():number {
    let paabl:number=9999;
    // for (let i=0; i < this.tbldata.length; i++ ){
    //   const wAble = Math.floor(this.tbldata[i].able / this.tbldata[i].irisu);
    //   if ( wAble < paabl ){
    //     paabl = wAble;
    //   }
    // }
    return paabl;
  }


}
