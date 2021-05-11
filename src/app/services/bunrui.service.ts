import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})

export class BunruiService {

  public daib: mwI.Sval[]=[];
  public bmon: mwI.Sval[]=[];
  public mtax: mwI.Sval[]=[];
  public tanka:mwI.Sval[]=[];
  public sptnk:mwI.Sval[]=[];
  public pay:  mwI.Sval[]=[];
  public nkin: mwI.Sval[]=[];
  public site: mwI.Sval[]=[];
  public htime:mwI.Sval[]=[];
  public jucd: mwI.Sval[]=[];
  public skbn: mwI.Sval[]=[];
  public taxrt: mwI.Sval[]=[];
  public gskbn: mwI.Sval[]=[];
  public tkbn: mwI.Sval[]=[];
  public zkbn: mwI.Sval[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

  get_bunrui():void {
    const GetMast = gql`
    query get_bunrui($id: smallint!){
      msbunrui(where: {id: {_eq: $id}},order_by: {kubun:asc, sort:asc, code:asc}) {
        kubun
        code
        name
        memo
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast, 
        variables: { 
          id : this.usrsrv.compid
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        for (let i=0;i<data.msbunrui.length;i++){
          if(data.msbunrui[i].kubun in this){
            let sval:mwI.Sval = {value:data.msbunrui[i].code,viewval:data.msbunrui[i].name};
            this[data.msbunrui[i].kubun].push(sval);
          }
        }
      },(error) => {
        console.log('error query get_bunrui', error);
      });
  }

}
