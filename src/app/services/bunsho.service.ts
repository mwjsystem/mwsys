import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class BunshoService {

  bunsho: mwI.Bunsho[]=[];
  constructor(private usrsrv: UserService,
    private apollo: Apollo) { }
    
    
  get_bunsho():void {
    const GetMast = gql`
    query get_bunsho($id: smallint!) {
    msbunsho(where: {id: {_eq: $id}}) {
      code
      name
      title
      gakutxt
      stamp
      atesaki
      message
      second
      include
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
        this.bunsho=data.msbunsho;
      },(error) => {
        console.log('error query get_bunsho', error);
      });
  }
  
}
