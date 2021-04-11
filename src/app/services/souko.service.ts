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
              private apollo: Apollo) { }

  get_souko():void {
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
        console.log('error query get_staff', error);
      });
  }

}
