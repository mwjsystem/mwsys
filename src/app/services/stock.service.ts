import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';
import { StoreService } from './store.service';
import { Subject, Observable } from 'rxjs';

export class Stock {
  gcode: string;
  scode: string;
  // yestr: number;
  stock: number;
  hikat: number;
  juzan: number;
  today: number;
  keepd: number;
  tommo: number;
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
  public shGcd:string;
  public stcGcd:string;
  // public isLoading:boolean=false;
  // // public subject = new Subject<Stock[]>();
  // public subject = new Subject<Stock>();
  // public observe = this.subject.asObservable();  
  constructor(public usrsrv: UserService,
              public strsrv: StoreService,
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

  set_shcount(gcd:string):Promise<boolean>{
    // this.isLoading=true;
    this.shGcd="";
    const GetTran = gql`
    query get_shcount($id: smallint!, $gcode: String!, $fr: String!, $to: String!) {
      vshukka(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, to_char: {_gte: $fr, _lte: $to}}, order_by: {to_char: asc}) {
        gcode
        to_char
        sum
      }
      vhatzan(where: {hatzan: {_gt: 0}, id: {_eq: $id}, gcode: {_eq: $gcode}}, order_by: {inday: asc_nulls_last}) {
        gcode
        yday
        ydaykbn
        hatzan
      }
      vhatzan_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}}) {
        aggregate {
          sum {
            hatzan
          }
        }
      }
    }`;
    this.stgds=new StGds();
    return new Promise( resolve => {    
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
          if(data.vhatzan.length>0){
            this.stgds.yday = data.vhatzan[0]?.yday;
            this.stgds.suu = data.vhatzan[0]?.hatzan;
            if(data.vhatzan[0]?.ydaykbn==0){
              this.stgds.ydtxt='入荷予定日(確定)';
            } else if(data.vhatzan[0]?.ydaykbn==1){
              this.stgds.ydtxt='入荷予定日(仮確定)';
            } else if(data.vhatzan[0]?.ydaykbn==2){
              this.stgds.ydtxt='暫定入荷予定日';
            } else {
              this.stgds.ydtxt='入荷予定日';
            }
          }else{
            this.stgds.yday = null;
            this.stgds.suu = 0;
            this.stgds.ydtxt='入荷予定日';
          }
          this.stgds.htzan=data.vhatzan_aggregate.aggregate.sum.hatzan;
          // this.isLoading=false;
          this.shGcd=gcd;
          return resolve(true);
          // console.log(this.shcnt,this.shlas);
        },(error) => {
          console.log('error query get_shcount', error);
          return resolve(true);
        });
    });  
  }

  get_stock(gcd:string,scd?:string):Promise<Stock[]>{
    console.log(gcd,scd);
    let scodes :string[]=null;
    const GetMast = gql`
    query get_gcdscd($id:smallint!,$gcode:String!,$scode:[String!]) {
      vgstana(where:{id:{_eq:$id},gcode: {_eq:$gcode}, code:{_in:$scode}}) {
        code
        gcode
        gskbn
        gtext
        unit
        tana
        day
      }
    }`;
    if(scd){
      scodes = [scd];
    }
    let lcstcs=[];
    return new Promise( resolve => {
      this.apollo.watchQuery<any>({
        query: GetMast, 
          variables: { 
            id : this.usrsrv.compid,
            gcode:gcd,
            scode:scodes
          },
        })
        .valueChanges
        .subscribe(({ data }) => { 
          // console.log(data);
          this.stgds.gtext=data.vgstana[0]?.gtext;
          this.stgds.gskbn=data.vgstana[0]?.gskbn;
          this.stgds.unit=data.vgstana[0]?.unit;
          
          Promise.all(data.vgstana.map(async item => {
            // console.log(item);
            let lcday:Date = item.day ?? new Date('2000-01-01');
            let lctana:number = item.tana ?? 0;          
            let lcstc= await this.get_zaiko(gcd,item.code,lcday,lctana);
            lcstcs.push(lcstc); 
          })).then(() => {
            return resolve(lcstcs);
          });
        },(error) => {
          console.log('error query get_shcount', error);
          return resolve(lcstcs);
        }); 
      });
 

  }

  async get_zaiko(gcd:string,scd:string,day:Date,stc:number):Promise<Stock> {
    const GetTran = gql`
    query get_zaiko($id: smallint!, $gcode: String!, $scode: String!, $day: date!, $today: date!,$nextd: date!) {
      trzaiko_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode},_or:[ {day: {_gt: $day}}, {day: {_lte: $today}}], scode: {_eq: $scode}}) {
        aggregate {
          sum {
            hnyu
            movi
            teni
            nyuk
            syuk
            movo
            teno
            haki
          }
        }
      }
      today:trjyumei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_eq: $today}, del: {_is_null: true}}) {
        aggregate { sum { suu }}}
      keepd:trjyumei_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_eq: "2"},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}
      hikat:trjyumei_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_eq: "1"},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}
      juzan:trjyumei_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}} 
      tommo:trjyumei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_eq: $nextd}, del: {_is_null: true}}) {
        aggregate { sum { suu }}}         
    }`;    

    return new Promise<Stock>( resolve => {
      // console.log(this.usrsrv.getNextday(new Date()));
      this.apollo.watchQuery<any>({
        query: GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            gcode: gcd,
            scode: scd,
            day: day,
            today:new Date(),       
            nextd:this.usrsrv.getNextday(new Date())
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let lcstcs:Stock={
          gcode: gcd,
          scode: scd,
          // yestr: 0,
          stock: stc + (data.trzaiko_aggregate.aggregate.sum.hnyu || 0)
                     + (data.trzaiko_aggregate.aggregate.sum.movi || 0)
                     + (data.trzaiko_aggregate.aggregate.sum.teni || 0)
                     + (data.trzaiko_aggregate.aggregate.sum.nyuk || 0)
                     - (data.trzaiko_aggregate.aggregate.sum.syuk || 0)
                     - (data.trzaiko_aggregate.aggregate.sum.movo || 0)
                     - (data.trzaiko_aggregate.aggregate.sum.teno || 0)
                     - (data.trzaiko_aggregate.aggregate.sum.haki || 0),
          hikat:data.hikat.aggregate.sum.suu || 0,
          juzan:data.juzan.aggregate.sum.suu || 0,
          today:data.today.aggregate.sum.suu || 0,
          keepd:data.keepd.aggregate.sum.suu || 0,
          tommo:data.tommo.aggregate.sum.suu || 0
        }
        return resolve(lcstcs);

      },(error) => {
        console.log('error query get_zaiko', error);
      });
    });
  }
  async get_zaiko2(gcd:string,scd:string,day:Date,stc:number):Promise<Stock> {
    const GetTran = gql`
    query get_zaiko($id: smallint!, $gcode: String!, $scode: String!, $day: date!, $today: date!,$nextd: date!) {
      siire:trsiimei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, inday: {_gt: $day}}) {
        aggregate { sum { suu }}}
      movin: trmovden_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, incode: {_eq: $scode}, day: {_gt: $day}}) {
        aggregate { sum { suu }}}
      tensaki: trtenden_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, day: {_gt: $day}, kubun: {_eq: "1"}}) {
        aggregate { sum { suu }}}
      hatgai: trhgnden_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, day: {_gt: $day}}) {
        aggregate { sum { suu }}}
      shukka:trjyumei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_gt: $day}, del: {_is_null: true}}) {
        aggregate { sum { suu }}}
      movout: trmovden_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, outcode: {_eq: $scode}, day: {_gt: $day}}) {
        aggregate { sum { suu }}}
      tenmoto: trtenden_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, day: {_gt: $day}, kubun: {_eq: "0"}}) {
        aggregate { sum { suu }}}
      haki: trhakden_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, day: {_gt: $day}}) {
        aggregate { sum { suu }}}
      today:trjyumei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_eq: $today}, del: {_is_null: true}}) {
        aggregate { sum { suu }}}
      keepd:trjyumei_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_eq: "2"},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
          aggregate { sum { suu }}}
      hikat:trjyumei_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_eq: "1"},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}
      juzan:trjyumei_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}} 
      tommo:trjyumei_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_eq: $nextd}, del: {_is_null: true}}) {
        aggregate { sum { suu }}}         
    }`;    

    return new Promise<Stock>( resolve => {
      // console.log(this.usrsrv.getNextday(new Date()));
      this.apollo.watchQuery<any>({
        query: GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            gcode: gcd,
            scode: scd,
            day: day,
            today:new Date(),       
            nextd:this.usrsrv.getNextday(new Date())
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let lcstcs:Stock={
          gcode: gcd,
          scode: scd,
          // yestr: 0,
          stock: stc + (data.siire.aggregate.sum.suu || 0)
                     + (data.movin.aggregate.sum.suu || 0)
                     + (data.tensaki.aggregate.sum.suu || 0)
                     + (data.hatgai.aggregate.sum.suu || 0)
                     - (data.shukka.aggregate.sum.suu || 0)
                     - (data.movout.aggregate.sum.suu || 0)
                     - (data.tenmoto.aggregate.sum.suu || 0)
                     - (data.haki.aggregate.sum.suu || 0),
          hikat:data.hikat.aggregate.sum.suu || 0,
          juzan:data.juzan.aggregate.sum.suu || 0,
          today:data.today.aggregate.sum.suu || 0,
          keepd:data.keepd.aggregate.sum.suu || 0,
          tommo:data.tommo.aggregate.sum.suu || 0
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
