import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class SoukoService {

  public scds: mwI.Sval[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) { 
                // this.get_souko();
              }

  get_souko():void {
    if (this.scds.length==0){
      const GetMast = gql`
      query get_souko($id: smallint!) {
        mssouko(where: {id: {_eq: $id}},order_by: {sort: asc}) {
          code
          subname
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
          data.mssouko.forEach(e => {
            this.scds.push({value:e.code,viewval:e.subname}); 
          });
        },(error) => {
          console.log('error query get_souko', error);
        });
    }
  }

  async get_sokoadr(scd):Promise<any> {
    const GetMast = gql`
    query get_souko($id: smallint!,$scd: String!) {
      mssouko_by_pk(id:$id,code:$scd) {
        name
        zip
        region
        local
        street
        extend
        tel
        fax
      }
    }`;
    return new Promise( resolve => {
      this.apollo.watchQuery<any>({
        query: GetMast, 
          variables: { 
            id : this.usrsrv.compid,
            scd:scd
          },
        })
        .valueChanges
        .subscribe(({ data }) => {
          return  resolve(data.mssouko_by_pk);
        },(error) => {
          console.log('error query get_sokoadr', error);
          return resolve(error);
        });
    });
  }
}
