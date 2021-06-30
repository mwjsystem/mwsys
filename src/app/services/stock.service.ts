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
  juzan: number;
  constructor(init?:Partial<Stock>) {
    Object.assign(this, init);
  }
}

export class StGds {
  gcode: string;
  gtext: string;
  gskbn: string;
  ndate: Date;
  incnt: number;
  htzan: number;
  moavg: number;
  iriunit: string; 
  motai: string;
  stcks:Stock[];
  constructor(init?:Partial<Stock>) {
    Object.assign(this, init);
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

  get_shcount(gcd:string){
    const GetTran = gql`
    query get_shcount($id: smallint!, $gcode: String!, $fr: String!, $to: String!) {
      vshukka(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, to_char: {_gte: $fr, _lte: $to}}, order_by: {to_char: asc}) {
        gcode
        to_char
        sum
      }
    }`;
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
          this.stgds.motai = this.shcnt.reduce((a,b)=>{return a+b;}) / las * 100 + '％';
        }
        // console.log(this.shcnt,this.shlas);
      },(error) => {
        console.log('error query get_shcount', error);
      });

  }

  get_stcscds(gcd:string,scd?:string){
    const GetTran = gql`
    query get_trgtana($id: smallint!, $gcode: String!,$scode: [String!]) {
      trgtana(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_in:$scode}}, distinct_on: [gcode, scode], order_by: {gcode: asc, scode: asc, day: desc}) {
        gcode
        scode
        day
      }
    }`;
    let observable:Observable<StGds> = new Observable<StGds>(observer => {
          let lcscd :string[];
          if(scd){
            lcscd=[scd];
          }
          this.apollo.watchQuery<any>({
          query: GetTran, 
            variables: { 
              id : this.usrsrv.compid,
              gcode:gcd,
              scode:lcscd
            },
          })
          .valueChanges
          .subscribe(({ data }) => {
            console.log(data);
            this.soksrv.scds.forEach(element => {
              let i:number=data.trgtana.findIndex(obj => obj.scode == element.value);
              if(i > -1 ){
                this.get_tana(gcd,element.value,data.trgtana[i].day,data.trgtana[i].tana).subscribe(value => {
                  this.stcs.push(value);
                });
              }

              

              
            });
            
            data.trgtana.forEach(element => {
              
            });;




          },(error) => {
            console.log('error query get_system', error);
          });

        
    });
    return observable;

  }
  get_tana(gcd:string,scd:string,day:Date,i:number) {
    const GetTran = gql`
    query get_trgtana($id: smallint!, $gcode: String!, $scode: String!, $day: date!) {
      trgtana(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, del: {_is_null: true}, scode: {_eq: $scode}, day: {_eq: $day}}) {
        gcode
        scode
        day
        tana
        created_at
        created_by
        updated_at
        updated_by
        memo
        del
      }
      trzaiko_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, day: {_gt: $day}}) {
        aggregate {
          sum {
            haki
            hatu
            henp
            hnyu
            jyut
            movi
            movo
            nyuk
            syuk
            teni
            teno
          }
        }
      }
      
    }`;    
    
    
    let observable:Observable<Stock> = new Observable<Stock>(observer => {
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




        observer.next(data.tropelog);
        // console.log(data.tropelog);
      },(error) => {
        console.log('error query get_opelog', error);
        observer.next();
        observer.complete();
      });
    });
    return observable;
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
