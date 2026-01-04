import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';
import { Subject, Observable } from 'rxjs';

export class Goods {
  gcode: string;
  gtext: string;
  gskbn: string;
  unit: string;
  msgzais: {
    zcode: string;
    irisu: string;
    msgoods: {
      gskbn: string;
    }
  };
  constructor(init?: Partial<Goods>) {
    Object.assign(this, init);
  }
}

export class Stcbs {
  gcode: string;
  scode: string;
  stock: number;
  hikat: number;
  keepd: number;
  yday: Date;
  suu: number;
  htzan: number;
  constructor(init?: Partial<Stcbs>) {
    Object.assign(this, init);
  }
}


export class Stock {
  gcode: string;
  scode: string;
  stock: number;
  hikat: number;
  juzan: number;
  today: number;
  keepd: number;
  tommo: number;
  constructor(init?: Partial<Stock>) {
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
  ydtxt: string;
  msgzais: {
    zcode: string;
    irisu: string;
    msgoods: {
      gskbn: string;
    }
  };
  constructor(init?: Partial<StGds>) {
    Object.assign(this, init);
    this.ydtxt = '入荷予定日';
  }
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  public goods: Goods[] = [];
  public stc: Stock = new Stock();
  public stcs: Stock[] = [];
  public shcnt: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  public shlas: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  public shavg: number = 0;
  public shsak: number = 0;
  private shcym: string[] = [];
  private shlym: string[] = [];
  public paabl: number = 0;
  public stcbs: Stcbs[] = [];
  public shGcd: string;
  public stcGcd: string;
  // public isLoading:boolean=false;
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  constructor(public usrsrv: UserService,
    // public strsrv: StoreService,
    private apollo: Apollo) {
    // this.getGoods();
    this.makeYyyymm();
  }

  makeYyyymm() {
    let date = new Date();
    for (let i = 1; i < 13; i++) {
      date.setMonth(date.getMonth() - 1);
      this.shcym.push(this.usrsrv.toYYYYMM(date));
    }
    for (let i = 1; i < 13; i++) {
      date.setMonth(date.getMonth() - 1);
      this.shlym.push(this.usrsrv.toYYYYMM(date));
    }
    // console.log(this.shcym,this.shlym);
  }

  getGoods() {
    const GetMast = gql`
    query get_goods($id: smallint!) {
      msgoods(where: {id: {_eq: $id}, tkbn: {_lt: "9"}}, order_by: {gcode: asc}) {
        gcode
        gtext
        gskbn
        unit
        msgzais{
          zcode
          irisu
          msgoods {
            gskbn
          }
        }
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        this.goods = data.msgoods;
      }, (error) => {
        console.log('error query get_goods', error);
      });
  }
  getShcount0(gcd: string): Promise<StGds> {
    // this.isLoading=true;
    this.shGcd = "";
    const GetTran = gql`
    query get_shcount($id: smallint!, $gcode: String!, $fr: String!, $to: String!) {
      vshukka(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, to_char: {_gte: $fr, _lte: $to}}, order_by: {to_char: asc}) {
        gcode
        to_char
        sum
      }
      vhatzn(where: {hatzn: {_gt: 0}, id: {_eq: $id}, gcode: {_eq: $gcode}}, order_by: {inday: asc_nulls_last}) {
        gcode
        yday
        ydaykbn
        hatzn
      }
      vhatzn_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}}) {
        aggregate {
          sum {
            hatzn
          }
        }
      }
    }`;
    let stgds: StGds = new StGds();
    return new Promise(resolve => {
      this.apollo.watchQuery<any>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          fr: this.shlym[11],
          to: this.shcym[0]
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data);
          for (let i = 0; i < 12; i++) {
            const j: number = data.vshukka.findIndex(obj => obj.to_char == this.shcym[i]);
            if (j > -1) {
              this.shcnt[i] = data.vshukka[j].sum;
            } else {
              this.shcnt[i] = 0;
            }
            const k: number = data.vshukka.findIndex(obj => obj.to_char == this.shlym[i]);
            if (k > -1) {
              this.shlas[i] = data.vshukka[k].sum;
            } else {
              this.shlas[i] = 0;
            }
          }
          stgds.moavg = this.shcnt.reduce((a, b) => { return a + b; }) / 12;
          const las: number = this.shlas.reduce((a, b) => { return a + b; });
          if (las == 0) {
            stgds.motai = '－';
          } else {
            stgds.motai = Math.round(this.shcnt.reduce((a, b) => { return a + b; }) / las * 1000) / 10 + '％';
          }
          if (data.vhatzn.length > 0) {
            stgds.yday = data.vhatzn[0]?.yday;
            stgds.suu = data.vhatzn[0]?.hatzn;
            if (data.vhatzn[0]?.ydaykbn == 0) {
              stgds.ydtxt = '入荷予定日(確定)';
            } else if (data.vhatzn[0]?.ydaykbn == 1) {
              stgds.ydtxt = '入荷予定日(仮確定)';
            } else if (data.vhatzn[0]?.ydaykbn == 2) {
              stgds.ydtxt = '暫定入荷予定日';
            } else {
              stgds.ydtxt = '入荷予定日';
            }
          } else {
            stgds.yday = null;
            stgds.suu = 0;
            stgds.ydtxt = '入荷予定日';
          }
          stgds.htzan = data.vhatzn_aggregate.aggregate.sum.hatzn;
          // this.isLoading=false;
          this.shGcd = gcd;
          return resolve(stgds);
          // console.log(this.shcnt,this.shlas);
        }, (error) => {
          console.log('error query get_shcount', error);
          return resolve(stgds);
        });
    });
  }
  getShcount1(gcd: string): Promise<StGds> {
    // this.isLoading=true;
    this.shGcd = "";
    const GetTran = gql`
    query get_shcount($id: smallint!, $gcode: String!, $fr: String!, $to: String!) {
      vshukka(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, to_char: {_gte: $fr, _lte: $to}}, order_by: {to_char: asc}) {
        gcode
        to_char
        sum
      }
    }`;
    let stgds: StGds = new StGds();
    return new Promise(resolve => {
      this.apollo.watchQuery<any>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          fr: this.shlym[11],
          to: this.shcym[0]
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data);
          for (let i = 0; i < 12; i++) {
            const j: number = data.vshukka.findIndex(obj => obj.to_char == this.shcym[i]);
            if (j > -1) {
              this.shcnt[i] = data.vshukka[j].sum;
            } else {
              this.shcnt[i] = 0;
            }
            const k: number = data.vshukka.findIndex(obj => obj.to_char == this.shlym[i]);
            if (k > -1) {
              this.shlas[i] = data.vshukka[k].sum;
            } else {
              this.shlas[i] = 0;
            }
          }
          stgds.moavg = this.shcnt.reduce((a, b) => { return a + b; }) / 12;
          const las: number = this.shlas.reduce((a, b) => { return a + b; });
          if (las == 0) {
            stgds.motai = '－';
          } else {
            stgds.motai = Math.round(this.shcnt.reduce((a, b) => { return a + b; }) / las * 1000) / 10 + '％';
          }
          // this.isLoading=false;
          this.shGcd = gcd;
          return resolve(stgds);
          // console.log(this.shcnt,this.shlas);
        }, (error) => {
          console.log('error query get_shcount', error);
          return resolve(stgds);
        });
    });
  }
  getStock(gcd: string, gskbn: string, scd?: string, date?: Date): Promise<Stock[]> {
    let scodes: string[] = [];
    let lcdate: Date;
    const GetView = gql`
    query get_gcdscd($id:smallint!,$gcode:String!,$scode:[String!]) {
      vgstana(where:{id:{_eq:$id},gcode: {_eq:$gcode}, code:{_in:$scode}}) {
        code
        gcode
        tana
        day
      }
    }`;
    if (scd) {
      scodes = [scd];
    }
    if (date != null) {
      lcdate = new Date(date);
    } else {
      lcdate = new Date();
    }
    // console.log(date,lcdate);
    let lcstcs = [];
    return new Promise(resolve => {
      // console.log(lcdate);
      this.apollo.watchQuery<any>({
        query: GetView,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          scode: scodes,
          // date:lcdate
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data);
          // this.stgds.gtext=data.vgstana[0]?.gtext;
          // this.stgds.gskbn=data.vgstana[0]?.gskbn;
          // this.stgds.unit=data.vgstana[0]?.unit;

          Promise.all(data.vgstana.map(async item => {
            // console.log(item);
            let lcday: Date = item.day ?? new Date('2000-01-01');
            let lctana: number = item.tana ?? 0;
            let lcstc;
            if (gskbn == "0") {
              lcstc = await this.getZaiko(gcd, item.code, lcday, lctana, lcdate);
            } else if (gskbn == "1") {
              lcstc = await this.getZaiko1(gcd, item.code, lcday, lctana);
            }
            lcstcs.push(lcstc);
          })).then(() => {
            return resolve(lcstcs);
          });
        }, (error) => {
          console.log('error query get_gcdscd', error);
          return resolve(lcstcs);
        });
    });
  }
  getStocktrn(gcd: string, scd: string, date: Date): Promise<number> {
    const GetTrans = gql`
    query get_gcdscd($id:smallint!,$gcd:String!,$scd:String!,$date:date!) {
      trgtana(where:{id:{_eq:$id},gcode:{_eq:$gcd},scode:{_eq:$scd},day:{_lt:$date}},order_by:{day:desc}) {
        scode
        gcode
        tana
        day
      }
    }`;
    const GetTran2 = gql`
    query get_zaiko($id: smallint!, $gcode: String!, $scode: String!, $day: date!, $today: date!) {
      trzaiko_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode},day: {_gt: $day,_lte: $today}, scode: {_eq: $scode}}) {
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
    }`;
    return new Promise(resolve => {
      this.apollo.watchQuery<any>({
        query: GetTrans,
        variables: {
          id: this.usrsrv.compid,
          gcd: gcd,
          scd: scd,
          date: date
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          let lcday: Date = data.trgtana[0]?.day ?? new Date('2000-01-01');
          let lctana: number = data.trgtana[0]?.tana ?? 0;
          // console.log('StockService',lcday,date);
          this.apollo.watchQuery<any>({
            query: GetTran2,
            variables: {
              id: this.usrsrv.compid,
              gcode: gcd,
              scode: scd,
              day: lcday,
              today: date
            },
          })
            .valueChanges
            .subscribe(({ data }) => {
              console.log('StockService2',data.trzaiko_aggregate.aggregate.sum,lctana);  				
              lctana = lctana + (data.trzaiko_aggregate.aggregate.sum.hnyu || 0)
                + (data.trzaiko_aggregate.aggregate.sum.movi || 0)
                + (data.trzaiko_aggregate.aggregate.sum.teni || 0)
                + (data.trzaiko_aggregate.aggregate.sum.nyuk || 0)
                - (data.trzaiko_aggregate.aggregate.sum.syuk || 0)
                - (data.trzaiko_aggregate.aggregate.sum.movo || 0)
                - (data.trzaiko_aggregate.aggregate.sum.teno || 0)
                - (data.trzaiko_aggregate.aggregate.sum.haki || 0);

              return resolve(lctana);
            }, (error) => {
              console.log('error query get_zaiko', error);
            });
          // this.get_zaiko(gcd,scd,lcday,lctana,date).then(result => {
          //   return resolve(result);
          // });

        }, (error) => {
          console.log('error query get_gcdscd', error);
          // return resolve(let lcstc);
        });
    });

  }
  getSetZai(scd: string, gzais): Promise<Stcbs[]> {
    return new Promise(resolve => {
      let lcstcs = [];
      Promise.all(gzais.map(async item => {
        if (item.msgoods.gskbn == '0') {
          let lcstc = await this.getStock(item.zcode, '1', scd);
          lcstcs.push({ irisu: item.irisu, ...lcstc[0] });
        }
      })).then(() => {
        return resolve(lcstcs);
      });
    });
  }

  async getZaiko(gcd: string, scd: string, day: Date, stc: number, tdy: Date): Promise<Stock> {
    // console.log(gcd + '_' + scd,day);
    const GetTran = gql`
    query get_zaiko($id: smallint!, $gcode: String!, $scode: String!, $day: date!, $today: date!,$nextd: date!) {
      trzaiko_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode},day: {_gt: $day,_lte: $today}, scode: {_eq: $scode}}) {
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
      today:vjmeizai_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_eq: $today},trjyuden: {del: {_eq: false}}, _or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}) {
        aggregate { sum { suu }}}
      keepd:vjmeizai_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_eq: "2"},trjyuden: {del: {_eq: false}}, _or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}
      hikat:vjmeizai_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_in:["1","4","5","6"]},trjyuden: {del: {_eq: false}}, _or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}
      juzan:vjmeizai_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},trjyuden: {del: {_eq: false}}, _or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}} 
      tommo:vjmeizai_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}, scode: {_eq: $scode}, sday: {_eq: $nextd}, trjyuden: {del: {_eq: false}}}) {
        aggregate { sum { suu }}}         
    }`;

    return new Promise<Stock>(resolve => {

      this.apollo.watchQuery<any>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          scode: scd,
          day: day,
          today: tdy,
          nextd: this.usrsrv.getNextday(tdy)
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(this.usrsrv.getNextday(tdy), data);
          let lcstcs: Stock = {
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
            hikat: data.hikat.aggregate.sum.suu || 0,
            juzan: data.juzan.aggregate.sum.suu || 0,
            today: data.today.aggregate.sum.suu || 0,
            keepd: data.keepd.aggregate.sum.suu || 0,
            tommo: data.tommo.aggregate.sum.suu || 0
          }
          // console.log(lcstcs);
          return resolve(lcstcs);

        }, (error) => {
          console.log('error query get_zaiko', error);
        });
    });
  }
  //在庫数取得(内訳用)
  async getZaiko1(gcd: string, scd: string, day: Date, stc: number): Promise<Stcbs> {
    const GetTran = gql`
    query get_zaiko($id: smallint!, $gcode: String!, $scode: String!, $day: date!, $today: date!) {
      trzaiko_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode},day: {_gt: $day,_lte: $today}, scode: {_eq: $scode}}) {
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
      hikat:vjmeizai_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_in: ["0","1"]},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}  
      keepd:vjmeizai_aggregate(where:{_and:{id:{_eq:$id},gcode:{_eq:$gcode},scode:{_eq:$scode},spec:{_eq: "2"},del:{_is_null:true},_or:[{sday:{_gt:$today}}, {sday:{_is_null:true}}]}}) {
        aggregate { sum { suu }}}
      vhatzn(where: {hatzn: {_gt: 0}, id: {_eq: $id}, gcode: {_eq: $gcode}}, order_by: {inday: asc_nulls_last}) {
        yday
        hatzn
      }
      vhatzn_aggregate(where: {id: {_eq: $id}, gcode: {_eq: $gcode}}) {
        aggregate {
          sum {
            hatzn
          }
        }
      }   
    }`;

    return new Promise<Stcbs>(resolve => {
      // console.log(this.usrsrv.getNextday(new Date()));
      this.apollo.watchQuery<any>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          scode: scd,
          day: day,
          today: new Date()
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          let lcstcs: Stcbs = {
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
            hikat: data.hikat.aggregate.sum.suu || 0,
            keepd: data.keepd.aggregate.sum.suu || 0,
            yday: data.vhatzn[0]?.yday,
            suu: data.vhatzn[0]?.hatzn,
            htzan: data.vhatzn_aggregate.aggregate.sum.hatzn
          }
          return resolve(lcstcs);

        }, (error) => {
          console.log('error query get_zaiko', error);
        });
    });
  }

  getPaabl(stcbs): number {
    let paabl: number = 9999;
    for (let i = 0; i < stcbs.length; i++) {
      const wAble = Math.floor((stcbs[i].stock - stcbs[i].hikat - stcbs[i].keepd) / stcbs[i].irisu);
      if (wAble < paabl) {
        paabl = wAble;
      }
    }
    return paabl;
  }


}