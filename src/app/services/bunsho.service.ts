import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

/** get_bunsho クエリの結果 */
interface BuntypeResult { msbuntype: mwI.Buntype[] }
interface BunshoResult { msbunsho: { code: string; name: string }[] }
@Injectable({
  providedIn: 'root'
})
export class BunshoService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);


  buntype: mwI.Buntype[] = [];
  bunsho: mwI.Bunsho[] = [];

  getBuntype(): void {
    if (this.bunsho.length == 0) {
      const GetMast = gql`
      query get_bunsho($id: smallint!) {
        msbuntype(where: {id: {_eq: $id}},order_by: {code: asc}) {
          code
          name
          first
          saki
          second
          sksec
        }
      }`;
      this.apollo.watchQuery<BuntypeResult>({
        query: GetMast,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // this.buntype = data.msbuntype
		  (data as BuntypeResult).msbuntype.forEach(element => {
            this.buntype.push({ code: element.code, 
			                    name: String(Number(element.code)) + ' ' + element.name,
								first: element.first,
								saki: element.saki,	
								second: element.second,	
								sksec: element.sksec
								});
          });
        }, (error) => {
          console.log('error query get_buntype', error);
        });
    }
  }
  getBunsho(): void {
    if (this.bunsho.length == 0) {
      const GetMast = gql`
      query get_bunsho($id: smallint!) {
        msbunsho(where: {id: {_eq: $id}},order_by: {code: asc}) {
          code
          name
        }
      }`;
      this.apollo.watchQuery<BunshoResult>({
        query: GetMast,
        variables: {
          id: this.usrsrv.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          (data as BunshoResult).msbunsho.forEach(element => {
            this.bunsho.push({ group: element.code.slice(0, 1), code: element.code, name: element.name });
          });
        }, (error) => {
          console.log('error query get_buntype', error);
        });
    }
  }




}