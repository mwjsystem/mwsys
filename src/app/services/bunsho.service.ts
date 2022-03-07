import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class BunshoService {

  buntype: mwI.Buntype[] = [];
  bunsho: mwI.Bunsho[] = [];
  constructor(private usrsrv: UserService,
    private apollo: Apollo) {
    // this.get_bunsho();
  }


  getBuntype(): void {
    if (this.bunsho.length == 0) {
      const GetMast = gql`
      query get_bunsho($id: smallint!) {
        msbuntype(where: {id: {_eq: $id}}) {
          code
          name
          first
          saki
          second
          sksec
        }
      }`;
      this.apollo.watchQuery<any>({
        query: GetMast,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.buntype = data.msbuntype
        }, (error) => {
          console.log('error query get_buntype', error);
        });
    }
  }

}
