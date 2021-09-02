import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})

export class BunruiService {

  public kbn:{ [key: string]: mwI.Sval[]; } = {};
  // public daib: mwI.Sval[]=[];
  // public bmon: mwI.Sval[]=[];
  // public mtax: mwI.Sval[]=[];
  // public tanka:mwI.Sval[]=[];
  // public sptnkbn:mwI.Sval[]=[];
  // public pay:  mwI.Sval[]=[];
  // public nkin: mwI.Sval[]=[];
  // public site: mwI.Sval[]=[];
  // public htime:mwI.Sval[]=[];
  // public jcode:mwI.Sval[]=[];
  // public skbn: mwI.Sval[]=[];
  // public taxrt:mwI.Sval[]=[];
  // public gskbn:mwI.Sval[]=[];
  // public genre:mwI.Sval[]=[];
  // public tkbn: mwI.Sval[]=[];
  // public zkbn: mwI.Sval[]=[];
  // public trttype: mwI.Sval[]=[];
  // public ydaykbn: mwI.Sval[]=[];
  // public jmeikbn: mwI.Sval[]=[];
  // public jdstatus: mwI.Sval[]=[];
  // public jdshsta: mwI.Sval[]=[];
  // public hdstatus: mwI.Sval[]=[];
  // public gkbn: mwI.Sval[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) {
                // this.get_bunrui(); 
                // console.log(this.daib);             
               }

  get_bunrui():void {
    if (Object.keys(this.kbn).length==0){
      // console.log(this.kbn);
      const GetMast = gql`
      query get_bunrui($id: smallint!){
        msbkbn {
          kubun
          msbunruis(where: {id: {_eq: $id}}, order_by: {sort: asc_nulls_last, value: asc}) {
            value
            viewval
          }
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
          // this.bunrui=data;
          for (let i=0;i<data.msbkbn.length;i++){
            this.kbn[data.msbkbn[i].kubun] = data.msbkbn[i].msbunruis;
          //   if(data.msbunrui[i].kubun in this){
          //     let sval:mwI.Sval = {value:data.msbunrui[i].code,viewval:data.msbunrui[i].name};
          //     this[data.msbunrui[i].kubun].push(sval);
          //   }
          }
          // console.log(this.bunrui);
          // this.hdstatus.unshift({value:null,viewval:""});
        },(error) => {
          console.log('error query get_bunrui', error);
        });
    }
  }

}
