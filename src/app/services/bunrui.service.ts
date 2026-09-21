import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

/** get_bunrui クエリの結果（区分ごとの分類値） */
interface BunruiResult { msbkbn: { kubun: string; msbunruis: mwI.Sval[] }[] }

@Injectable({
  providedIn: 'root'
})

export class BunruiService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);


  public kbn: { [key: string]: mwI.Sval[]; } = {};

  getBunrui(): void {
    this.qryBunrui();
  }

  async qryBunrui(): Promise<{ [key: string]: mwI.Sval[]; }> {
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

    return new Promise(resolve => {
      if (Object.keys(this.kbn).length > 0) {
        return resolve(this.kbn);
      } else {
        this.apollo.watchQuery<BunruiResult>({
          query: GetMast,
          variables: {
            id: this.usrsrv.compid
          },
        })
          .valueChanges
          .subscribe(({ data }) => {

            const msbkbn = (data as BunruiResult).msbkbn;
            for (let i = 0; i < msbkbn.length; i++) {
              this.kbn[msbkbn[i].kubun] = msbkbn[i].msbunruis;
            }
            return resolve(this.kbn);
          }, (error) => {
            console.log('error query get_bunrui', error);
          });
      }
    })

  }

  getSubcat(cat: string) {
    this.qryBunrui();
    return this.kbn['subcat']?.filter(obj => {
      if (obj.value!.slice(0, 2) == cat) {
        return true;
      }
    })
  }
  getName(value: string, kubun: string): string {
    let i: number = this.kbn[kubun].findIndex(obj => obj.value == value);
    let name: string = "";
    if (i > -1) {
      name = this.kbn[kubun][i]['viewval'];
    }
    return name;
  }
}