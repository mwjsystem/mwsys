import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';

export interface Ggrp {
  code: string;
  name: string;
  kana: string;
  gkbn: string;
  sozai: string;
  vcode: string;
  tcode: string;
}

@Injectable({
  providedIn: 'root'
})

export class GoodsService {
  // public salgds: mwI.SalGds[]=[];

  public grpcd: string;
  public goods: mwI.Goods[] = [];
  public ggrps: Ggrp[] = [];
  public gtnks: mwI.Gtanka[] = [];

  constructor(private usrsrv: UserService,
    private apollo: Apollo) { }

  getGgroups(): Promise<Boolean> {
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
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.ggrps = data.msggroup;
          resolve(true);
        }, (error) => {
          console.log('error query get_ggroups', error);
        });
    });
  }



}