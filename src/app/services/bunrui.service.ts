import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})

export class BunruiService {

  public kbn:{ [key: string]: mwI.Sval[]; } = {};

  constructor(private usrsrv: UserService,
              private apollo: Apollo) {
               }

  get_bunrui():void{
    this.qry_bunrui();
  }

  async qry_bunrui():Promise<any> {
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
        
    return new Promise( resolve => {
      if (Object.keys(this.kbn).length>0){
        return resolve(this.kbn);  
      } else {
        this.apollo.watchQuery<any>({
          query: GetMast, 
            variables: { 
              id : this.usrsrv.compid
            },
          })
          .valueChanges
          .subscribe(({ data }) => {

            for (let i=0;i<data.msbkbn.length;i++){
              this.kbn[data.msbkbn[i].kubun] = data.msbkbn[i].msbunruis; 
            }
            return resolve(this.kbn); 
          },(error) => {
            console.log('error query get_bunrui', error);
          });
      }
    })
    
  }

  // async get_name(value: string, kubun: string):Promise<any>  {
  //   // this.bunsrv.get_bunrui();
  //   this.qry_bunrui().then((result) => {    
  //     console.log(kubun, result);    
  //     let i:number = result[kubun].findIndex(obj => obj.value == value);
  //     // console.log(kubun, this.bunsrv.kbn);
  //     let name:string="";
  //     if( i > -1 ){
  //       name = result[kubun][i]['viewval'];
  //     }
  //     return name;
  //   })
  // }
}
