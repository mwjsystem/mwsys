import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
// import { AbstractControl } from '@angular/forms';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})

export class GoodsService {
  public salgds: mwI.SalGds[]=[];
  public goods: mwI.Goods[]=[];
  public gtnks: mwI.Gtanka[]=[];
  public subGds = new Subject<mwI.Goods[]>();
  public subTnk = new Subject<mwI.Gtanka[]>();
  public obserGds = this.subGds.asObservable();
  public obserTnk = this.subTnk.asObservable();

  constructor(private usrsrv: UserService,
              private apollo: Apollo) {}

  get_Goods(day:string):void {
    const GetMast = gql`
    query get_goods($id: smallint!,$day: date!) {
      msgoods(where: {id: {_eq: $id}}) {
        msggroup {
          gkbn
          siire
        }
        gcode
        gtext
        irisu
        iriunit
        koguchi
        max
        order
        send
        skbn
        zkbn
        msgtankas_aggregate(where: {day: {_lt: $day}}) {
          aggregate {
            max {
              day
            }
          }
        }
      }
    }`;
    this.salgds=[];
    this.apollo.watchQuery<any>({
      query: GetMast, 
        variables: { 
          id : this.usrsrv.compid,
          day :day
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        data.msgoods.forEach(e => {
          const good:mwI.SalGds={
            gcode : e.gcode,
            gtext : e.gtext,
            irisu : e.irisu,
            iriunit : e.iriunit,
            koguchi : e.koguchi,
            max   : e.max,
            order   : e.order,
            send  : e.send,
            skbn  : e.skbn,
            zkbn  : e.zkbn,
            gkbn  : e.msggroup.gkbn,
            siire : e.msggroup.siire,
            day   : e.msgtankas_aggregate.aggregate.max.day
          };
        this.salgds.push(good);
        });
      },(error) => {
        console.log('error query get_Goods', error);
      });
  } 

}
