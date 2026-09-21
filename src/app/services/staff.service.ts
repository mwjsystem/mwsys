import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

/** get_staff クエリの行 */
interface StaffRow { code: string; mail: string; sei: string; mei: string | null }
/** get_staff クエリの結果 */
interface StaffResult { msstaff: StaffRow[] }
@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);


  public tcds: mwI.Sval[] = [];
  private stfs: StaffRow[] = [];

  getStaff(): void {
    const GetMast = gql`
    query get_staff($id: smallint!){
      msstaff(where: {id: {_eq: $id}},order_by: {sort:asc_nulls_last}) {
        code
        mail
        sei
        mei
      }
    }`;
    this.apollo.watchQuery<StaffResult>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(this.stfs,data.msstaff);
        this.tcds = [{ value: null, viewval: "" }];
        this.stfs = (data as StaffResult).msstaff;
        (data as StaffResult).msstaff.forEach(e => {
          this.tcds.push({ value: e.code, viewval: e.sei + (e.mei ?? "") }); //e.meiがnull等の時は、''を結合
        });
      }, (error) => {
        console.log('error query get_staff', error);
      });
  }
  getName(code: string): string {
    if (this.stfs.length == 0) {
      this.getStaff();
    }
    const i: number = this.stfs.findIndex(obj => obj.code == code);
    let ret: string;
    if (i > -1) {
      ret = this.stfs[i].sei;
    } else {
      ret = '';
    }
    return ret;
  }

}