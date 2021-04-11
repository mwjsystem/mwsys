import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class MembsService {

  membs:  mwI.Mcode[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

  get_members():void {
    const GetMast = gql`
    query get_members($id: smallint!) {
      msmember(where: {id: {_eq: $id}}, order_by: {mcode: asc}) {
        mcode
        sei
        mei
        del
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
        this.membs=data.msmember;
      },(error) => {
        console.log('error query get_members', error);
      });
  }
}
