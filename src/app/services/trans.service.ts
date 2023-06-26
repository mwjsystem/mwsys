import { Injectable } from '@angular/core';
import { UserService } from './user.service';
import { MembsService } from './../mstmember/membs.service';
import { BunruiService } from './bunrui.service';
import { StockService } from './stock.service';
import { Subject, Observable } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

export class Trans {
  sday: String;
  ttype: String;
  denno: number;
  line: number;
  biko: String;
  tcode: String;
  yday: String;
  aitec: number;
  aiten: String;
  insuu: number;
  ousuu: number;
  zaisu: number;
  yotei: number;
  wait: number;
  srtdy: String;
  constructor(init?: Partial<Trans>) {
    Object.assign(this, init);
  }
}

@Injectable({
  providedIn: 'root'
})
export class TransService {
  public tbldata: Trans[] = [];
  public flg: number = 1;
  //コンポーネント間通信用
  subject = new Subject<boolean>();
  observe = this.subject.asObservable();

  constructor(public usrsrv: UserService,
    public memsrv: MembsService,
    public bunsrv: BunruiService,
    public stcsrv: StockService,
    private apollo: Apollo) {
  }

  async getTrans(gcd: string, scd: string, day: Date): Promise<Trans[]> {
    const lcmago = this.usrsrv.getLastMonth(day);
    // console.log(lcmago);
    let lcprms1: Promise<Trans[]> = new Promise(resolve => {
      this.stcsrv.getStocktrn(gcd, scd, lcmago).then(e => {
        // console.log(e);
        let trans: Trans[] = [];
        const tran: Trans = {
          sday: this.usrsrv.formatDate(lcmago),
          ttype: '前残',
          denno: null,
          line: null,
          biko: null,
          tcode: null,
          yday: null,
          aitec: null,
          aiten: null,
          insuu: e,
          ousuu: null,
          zaisu: e,
          yotei: null,
          wait: null,
          srtdy: this.usrsrv.formatDate(lcmago),
        };
        trans.push(tran);
        return resolve(trans);
      })
    })
    const GetTran = gql`
    query get_trans($id: smallint!, $gcd: String!, $scd: String!, $day: date!, $today: date!) {
      shukka:vjmeizai(where: {id: {_eq: $id}, gcode: {_eq: $gcd},sday: {_gt: $day,_lte: $today}, scode: {_eq: $scd},trjyuden: {skbn: {_neq: "1"},del: {_eq: false}}}) {
        sday
        denno
        line
        spec
        spdet
        mmemo
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
        mmemo
        suu
        trsiiden{
          tcode
          vcode
          msvendor {
            adrname
          }
        }
      } 
      movin:trmovden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},trmovsub:{day: {_gt: $day,_lte: $today}, incode: {_eq: $scd}}}) {
        denno
        line
        memo
        suu
        trmovsub {
          day
          outcode
          tcode
          msstoreout{
            name
          }
        }
      }  
      movout:trmovden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},trmovsub:{day: {_gt: $day,_lte: $today}, outcode: {_eq: $scd}}}) {
        denno
        line
        memo
        suu
        trmovsub {
          day
          incode
          tcode
          msstorein{
            name
          }
        }
      }
      tenmoto:trtenden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},day: {_gt: $day,_lte: $today}, scode: {_eq: $scd}, kubun: {_eq: 1}}) {
        day
        denno
        line
        memo
        suu
        tcode
      } 
      tensaki:trtenden(where: {id: {_eq: $id}, gcode: {_eq: $gcd},day: {_gt: $day,_lte: $today}, scode: {_eq: $scd}, kubun: {_eq: 0}}) {
        day
        denno
        line
        memo
        suu
        tcode
      } 
      hikat:vjmeizai(where: {id: {_eq: $id}, 
                             gcode: {_eq: $gcd}, 
                             scode: {_eq: $scd},
                             trjyuden: {skbn: {_neq: "1"},del: {_eq: false}},
                              _or:[{sday:{_gt:$today}}, 
                                   {sday:{_is_null:true}}
                                  ]
                              }) {
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
      hatzn:vnymat(where: {id: {_eq: $id}, gcode: {_eq: $gcd}, hatzn: {_gt: 0}}) {
        denno
        line
        mbiko
        yday
        ydaykbn
        hatzn
        tcode
        vcode
        adrname
        nymat
      }                   
    }`;
    let lcprms2: Promise<Trans[]> = new Promise(resolve => {
      this.apollo.watchQuery<any>({
        query: GetTran,
        variables: {
          id: this.usrsrv.compid,
          gcd: gcd,
          scd: scd,
          day: lcmago,
          today: new Date()
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log('出荷',data);
          let trans: Trans[] = [];
          data.shukka.forEach(e => {
            let lcsrtdy = e.sday ?? e.yday;
            const tran: Trans = {
              sday: e.sday,
              ttype: '出荷',
              denno: e.denno,
              line: e.line,
              biko: e.mbikou,
              tcode: e.trjyuden.tcode,
              yday: null,
              aitec: e.trjyuden.mcode,
              aiten: e.trjyuden.msmember.sei + (e.trjyuden.msmember.mei ?? ""),
              insuu: null,
              ousuu: e.suu,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: lcsrtdy
            };
            trans.push(tran);
          });
          data.siire.forEach(e => {
            const tran: Trans = {
              sday: e.yday,
              ttype: '仕入',
              denno: e.denno,
              line: e.line,
              biko: e.mbiko,
              tcode: e.trsiiden.tcode,
              yday: null,
              aitec: e.trsiiden.vcode,
              aiten: e.trsiiden.msvendor.adrname,
              insuu: e.suu,
              ousuu: null,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: e.yday
            };
            trans.push(tran);
          });
          data.movin.forEach(e => {
            const tran: Trans = {
              sday: e.trmovsub.day,
              ttype: '移動入庫',
              denno: e.denno,
              line: e.line,
              biko: e.mbiko,
              tcode: e.trmovsub.tcode,
              yday: null,
              aitec: e.trmovsub.outcode,
              aiten: e.trmovsub.msstoreout.name,
              insuu: e.suu,
              ousuu: null,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: e.trmovsub.day
            };
            trans.push(tran);
          });
          data.movout.forEach(e => {
            const tran: Trans = {
              sday: e.trmovsub.day,
              ttype: '移動出庫',
              denno: e.denno,
              line: e.line,
              biko: e.mbiko,
              tcode: e.trmovsub.tcode,
              yday: null,
              aitec: e.trmovsub.incode,
              aiten: e.trmovsub.msstorein.name,
              insuu: null,
              ousuu: e.suu,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: e.trmovsub.day
            };
            trans.push(tran);
          });
          data.tenmoto.forEach(e => {
            const tran: Trans = {
              sday: e.day,
              ttype: '展開元',
              denno: e.denno,
              line: e.line,
              biko: e.memo,
              tcode: e.tcode,
              yday: null,
              aitec: null,
              aiten: null,
              insuu: null,
              ousuu: e.suu,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: e.day
            };
            trans.push(tran);
          });
          data.tensaki.forEach(e => {
            const tran: Trans = {
              sday: e.day,
              ttype: '展開先',
              denno: e.denno,
              line: e.line,
              biko: e.memo,
              tcode: e.tcode,
              yday: null,
              aitec: null,
              aiten: null,
              insuu: e.suu,
              ousuu: null,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: e.day
            };
            trans.push(tran);
          });
          // console.log(data);
          data.hikat.forEach(e => {
            // console.log(e.sday);
            let lcsrtdy = e.sday ?? e.trjyuden.yday;
            let lcbiko;
            if (e.spec == "8") {
              lcbiko = e.spdet;
            } else {
              lcbiko = e.mbikou;
            }
            const tran: Trans = {
              sday: e.sday,
              ttype: this.bunsrv.getName(e.spec, 'jmeikbn'),
              denno: e.denno,
              line: e.line,
              biko: lcbiko,
              tcode: e.trjyuden.tcode,
              yday: e.trjyuden.yday,
              aitec: e.trjyuden.mcode,
              aiten: e.trjyuden.msmember.sei + (e.trjyuden.msmember.mei ?? ""),
              insuu: null,
              ousuu: e.suu,
              zaisu: null,
              yotei: null,
              wait: null,
              srtdy: lcsrtdy
            };
            trans.push(tran);
          });
          data.hatzn.forEach(e => {
            // console.log(e.sday);
            const tran: Trans = {
              sday: null,
              ttype: '入荷予定',
              denno: e.denno,
              line: e.line,
              biko: e.mbikou,
              tcode: e.tcode,
              yday: e.yday,
              aitec: e.vcode,
              aiten: e.adrname,
              insuu: null,
              ousuu: null,
              zaisu: null,
              yotei: e.hatzn,
              wait: e.nymat,
              srtdy: e.yday
            };
            trans.push(tran);
          });
          return resolve(trans);
        }, (error) => {
          console.log('error query get_trans', error);
        });
    })
    return new Promise(resolve => {
      Promise.all([lcprms1, lcprms2]).then(result => {
        let trans: Trans[] = [];
        result.forEach(element => {
          // console.log('Promise.all',element);
          trans = trans.concat(element);
        });
        return resolve(this.sortTblData(trans));
      })
    })
  }

  sortTblData(tbldata): Trans[] {
    // return new Promise( resolve => {
    tbldata.sort(function (a, b) {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      if (a.srtdy > b.srtdy) {
        return 1;
      } else {
        return -1;
      }
    })
    let wGenz: number = 0;
    for (let i = 0; i < tbldata.length; i++) {
      if (tbldata[i].sday != null) {
        wGenz += tbldata[i].insuu - tbldata[i].ousuu;
        tbldata[i].zaisu = wGenz;
      }
    }
    if (this.flg == -1) {
      tbldata.sort(function (a, b) {
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        if (a.srtdy < b.srtdy) {
          return 1;
        } else {
          return -1;
        }
      })
    }
    return tbldata;
    // return resolve(tbldata);
    // })
  }
}