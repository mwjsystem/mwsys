import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
// import { AbstractControl } from '@angular/forms';
import gql from 'graphql-tag';
import { UserService } from './user.service';

export interface Ggrp {
  code:string;
  name:string;
  kana:string;
  gkbn:string;
  sozai:string;
  vcode:string;
  tcode:string;
} 

@Injectable({
  providedIn: 'root'
})

export class GoodsService {
  // public salgds: mwI.SalGds[]=[];
  public goods: mwI.Goods[]=[];
  public ggrps: Ggrp[]=[];
  public gtnks: mwI.Gtanka[]=[];
  public subGds = new Subject<mwI.Goods[]>();
  public subTnk = new Subject<mwI.Gtanka[]>();
  public obserGds = this.subGds.asObservable();
  public obserTnk = this.subTnk.asObservable();

  constructor(private usrsrv: UserService,
              private apollo: Apollo) {}

  // get_Goods(day:string):void {
  //   const GetMast = gql`
  //   query get_goods($id: smallint!,$day: date!) {
  //     msgoods(where: {id: {_eq: $id}}) {
  //       msggroup {
  //         gkbn
  //         vcode
  //       }
  //       gcode
  //       gtext
  //       irisu
  //       iriunit
  //       koguchi
  //       max
  //       order
  //       send
  //       gskbn
  //       zkbn
  //       msgtankas_aggregate(where: {day: {_lt: $day}}) {
  //         aggregate {
  //           max {
  //             day
  //           }
  //         }
  //       }
  //     }
  //   }`;
  //   this.salgds=[];
  //   this.apollo.watchQuery<any>({
  //     query: GetMast, 
  //       variables: { 
  //         id : this.usrsrv.compid,
  //         day :day
  //       },
  //     })
  //     .valueChanges
  //     .subscribe(({ data }) => {
  //       data.msgoods.forEach(e => {
  //         const good:mwI.SalGds={
  //           gcode : e.gcode,
  //           gtext : e.gtext,
  //           irisu : e.irisu,
  //           iriunit : e.iriunit,
  //           koguchi : e.koguchi,
  //           max   : e.max,
  //           order   : e.order,
  //           send  : e.send,
  //           skbn  : e.skbn,
  //           zkbn  : e.zkbn,
  //           gkbn  : e.msggroup.gkbn,
  //           vcode : e.msggroup.vcode,
  //           day   : e.msgtankas_aggregate.aggregate.max.day
  //         };
  //       this.salgds.push(good);
  //       });
  //     },(error) => {
  //       console.log('error query get_Goods', error);
  //     });
  // } 

  get_ggroups():Promise<Boolean> {
    const GetMast = gql`
    query get_groups($id: smallint!) {
      msggroup(where: {id: {_eq: $id}}, order_by: {code: asc}) {
        code
        name
        kana
        gkbn
        sozai
        vcode
        tcode
      }
    }`;
    return new Promise<Boolean>(resolve => {
      this.apollo.watchQuery<any>({
        query: GetMast, 
          variables: { 
            id : this.usrsrv.compid
          },
        })
        .valueChanges
        .subscribe(({ data }) => {
          this.ggrps=data.msggroup;
          resolve(true);
        },(error) => {
          console.log('error query get_ggroups', error);
        });
    });
  }
}
