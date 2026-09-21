import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';
import { Subject, Observable } from 'rxjs';

export class Goods {
  gcode!: string;
  gtext!: string;
  gskbn!: string;
  unit!: string;
  msgzais!: {
        zcode: string;
        irisu: string;
        msgoods: {
            gskbn: string;
        };
    }[];
  constructor(init?: Partial<Goods>) {
    Object.assign(this, init);
  }
}

export class Stcbs {
  gcode!: string;
  scode!: string;
  stock!: number;
  hikat!: number;
  keepd!: number;
  yday!: Date;
  suu!: number;
  htzan!: number;
  constructor(init?: Partial<Stcbs>) {
    Object.assign(this, init);
  }
}


export class Stock {
  gcode!: string;
  scode!: string;
  stock!: number;
  hikat!: number;
  juzan!: number;
  today!: number;
  keepd!: number;
  tommo!: number;
  constructor(init?: Partial<Stock>) {
    Object.assign(this, init);
  }
}

export class StGds {
  gcode!: string;
  gtext!: string;
  gskbn!: string;
  yday!: Date | null;
  suu!: number;
  htzan!: number;
  moavg!: number;
  unit!: string;
  motai!: string;
  ydtxt: string;
  msgzais!: {
        zcode: string;
        irisu: string;
        msgoods: {
            gskbn: string;
        };
    }[];
  constructor(init?: Partial<StGds>) {
    Object.assign(this, init);
    this.ydtxt = '入荷予定日';
  }
}

/** 在庫内訳（構成品）の 1 行。irisu は入り数 */
export type GzaiRef = { zcode: string; irisu: number | string; msgoods: { gskbn: string } };
/** getSetZai の結果。構成品ごとの在庫（Stcbs）に入り数が付く */
export type StcbsZai = Stcbs & { irisu: number | string };

/** trzaiko_aggregate の合計値（該当なしは null） */
interface ZaikoSum { hnyu: number | null; movi: number | null; teni: number | null; nyuk: number | null; syuk: number | null; movo: number | null; teno: number | null; haki: number | null }
interface ZaikoAgg { aggregate: { sum: ZaikoSum } }
interface SuuAgg { aggregate: { sum: { suu: number | null } } }
interface HatznAgg { aggregate: { sum: { hatzn: number } } }
interface ShukkaRow { gcode: string; to_char: string; sum: number }
/** vhatzn（入荷予定）の行。yday は日付、ydaykbn は入荷予定日の区分（0:確定 1:仮確定 2:暫定） */
interface HatznRow { gcode: string; yday: Date; ydaykbn: number | string; hatzn: number }

/** get_goods クエリの結果 */
interface GoodsResult { msgoods: Goods[] }
/** get_shcount クエリの結果（getShcount1 は vshukka のみ） */
interface Shcount1Result { vshukka: ShukkaRow[] }
interface Shcount0Result extends Shcount1Result { vhatzn: HatznRow[]; vhatzn_aggregate: HatznAgg }
/** get_gcdscd クエリの結果（vgstana: 在庫の棚卸） */
interface GstanaResult { vgstana: { code: string; gcode: string; tana: number | null; day: Date | null }[] }
/** get_gcdscd クエリの結果（trgtana: 商品別の棚卸） */
interface GtanaResult { trgtana: { scode: string; gcode: string; tana: number | null; day: Date | null }[] }
/** get_zaiko クエリの結果（入出庫の合計のみ） */
interface ZaikoSumResult { trzaiko_aggregate: ZaikoAgg }
/** get_zaiko クエリの結果（getZaiko） */
interface ZaikoResult extends ZaikoSumResult { today: SuuAgg; keepd: SuuAgg; hikat: SuuAgg; juzan: SuuAgg; tommo: SuuAgg }
/** get_zaiko クエリの結果（getZaiko1: 内訳用） */
interface Zaiko1Result extends ZaikoSumResult { hikat: SuuAgg; keepd: SuuAgg; vhatzn: { yday: Date; hatzn: number }[]; vhatzn_aggregate: HatznAgg }
@Injectable({
  providedIn: 'root'
})
export class StockService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

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
  public stcbs: StcbsZai[] = [];
  public shGcd!: string;
  public stcGcd!: string;
  // public isLoading:boolean=false;
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  constructor() {
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
    this.apollo.watchQuery<GoodsResult>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid
      },
    })
      .valueChanges
      .subscribe(({ data: raw }) => {
        const data = raw as GoodsResult;
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
      this.apollo.watchQuery<Shcount0Result>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          fr: this.shlym[11],
          to: this.shcym[0]
        },
      })
        .valueChanges
        .subscribe(({ data: raw }) => {
          const data = raw as Shcount0Result;
          // console.log(data);
          for (let i = 0; i < 12; i++) {
            const j: number = data.vshukka.findIndex((obj: { to_char: string; }) => obj.to_char == this.shcym[i]);
            if (j > -1) {
              this.shcnt[i] = data.vshukka[j].sum;
            } else {
              this.shcnt[i] = 0;
            }
            const k: number = data.vshukka.findIndex((obj: { to_char: string; }) => obj.to_char == this.shlym[i]);
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
      this.apollo.watchQuery<Shcount1Result>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          fr: this.shlym[11],
          to: this.shcym[0]
        },
      })
        .valueChanges
        .subscribe(({ data: raw }) => {
          const data = raw as Shcount1Result;
          // console.log(data);
          for (let i = 0; i < 12; i++) {
            const j: number = data.vshukka.findIndex((obj: { to_char: string; }) => obj.to_char == this.shcym[i]);
            if (j > -1) {
              this.shcnt[i] = data.vshukka[j].sum;
            } else {
              this.shcnt[i] = 0;
            }
            const k: number = data.vshukka.findIndex((obj: { to_char: string; }) => obj.to_char == this.shlym[i]);
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
    let lcstcs: Stock[] = [];
    return new Promise(resolve => {
      // console.log(lcdate);
      this.apollo.watchQuery<GstanaResult>({
        query: GetView,
        variables: {
          id: this.usrsrv.compid,
          gcode: gcd,
          scode: scodes,
          // date:lcdate
        },
      })
        .valueChanges
        .subscribe(({ data: raw }) => {
          const data = raw as GstanaResult;
          // console.log(data);
          // this.stgds.gtext=data.vgstana[0]?.gtext;
          // this.stgds.gskbn=data.vgstana[0]?.gskbn;
          // this.stgds.unit=data.vgstana[0]?.unit;

          Promise.all(data.vgstana.map(async item => {
            // console.log(item);
            let lcday: Date = item.day ?? new Date('2000-01-01');
            let lctana: number = item.tana ?? 0;
            let lcstc: Stock | Stcbs | undefined;
            if (gskbn == "0") {
              lcstc = await this.getZaiko(gcd, item.code, lcday, lctana, lcdate);
            } else if (gskbn == "1") {
              lcstc = await this.getZaiko1(gcd, item.code, lcday, lctana);
            }
            lcstcs.push(lcstc as Stock); // gskbn が 1 のときは内訳用（Stcbs）が入る。従来どおり Stock[] として返す
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
      this.apollo.watchQuery<GtanaResult>({
        query: GetTrans,
        variables: {
          id: this.usrsrv.compid,
          gcd: gcd,
          scd: scd,
          date: date
        },
      })
        .valueChanges
        .subscribe(({ data: raw }) => {
          const data = raw as GtanaResult;
          let lcday: Date = data.trgtana[0]?.day ?? new Date('2000-01-01');
          let lctana: number = data.trgtana[0]?.tana ?? 0;
          // console.log('StockService',gcd,scd,lcday,date);
          this.apollo.watchQuery<ZaikoSumResult>({
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
            .subscribe(({ data: raw }) => {
              const data = raw as ZaikoSumResult;
              // console.log('StockService2',data.trzaiko_aggregate.aggregate.sum,lctana);  				
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
  getSetZai(scd: string, gzais: GzaiRef[]): Promise<StcbsZai[]> {
    return new Promise(resolve => {
      let lcstcs: StcbsZai[] = [];
	  // console.log('getSetZai1',gzais);
      Promise.all(gzais.map(async (item) => {
		// console.log('getSetZai2',item,item.msgoods.gskbn);
        if (item.msgoods.gskbn == '0') {
          let lcstc = await this.getStock(item.zcode, '1', scd);
		  // console.log('getSetZai3',item,lcstc);
          lcstcs.push({ irisu: item.irisu, ...(lcstc[0] as unknown as Stcbs) }); // gskbn 1 で取得するため実体は Stcbs
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

      this.apollo.watchQuery<ZaikoResult>({
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
        .subscribe(({ data: raw }) => {
          const data = raw as ZaikoResult;
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
      this.apollo.watchQuery<Zaiko1Result>({
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
        .subscribe(({ data: raw }) => {
          const data = raw as Zaiko1Result;
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

  getPaabl(stcbs: StcbsZai[]): number {
    let paabl: number = 9999;
    for (let i = 0; i < stcbs.length; i++) {
      const wAble = Math.floor((stcbs[i].stock - stcbs[i].hikat - stcbs[i].keepd) / Number(stcbs[i].irisu));
      if (wAble < paabl) {
        paabl = wAble;
      }
    }
    return paabl;
  }


}