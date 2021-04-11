import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class StaffService {

  public tcds: mwI.Sval[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

  get_staff():void {
    const GetMast = gql`
    query get_staff($id: smallint!){
      msstaff(where: {id: {_eq: $id}}) {
        code
        name
        mail
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
        data.msstaff.forEach(e => {
          this.tcds.push({value:e.code,viewval:e.name});
        });
      },(error) => {
        console.log('error query get_staff', error);
      });
  }                
  
}
