import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class StaffService {

  public tcds: mwI.Sval[]=[];
  private stfs: mwI.Staff[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) {
                // this.get_staff();
               }

  get_staff():void {
    const GetMast = gql`
    query get_staff($id: smallint!){
      msstaff(where: {id: {_eq: $id}},order_by: {sort:asc_nulls_last}) {
        code
        mail
        sei
        mei
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
      // console.log(this.stfs,data.msstaff);
      this.tcds=[{value:null,viewval:""}];
      this.stfs=data.msstaff;
      data.msstaff.forEach(e => {
        this.tcds.push({value:e.code,viewval:e.sei + (e.mei ?? "")}); //e.meiがnull等の時は、''を結合
      });
    },(error) => {
      console.log('error query get_staff', error);
    });
  }  
  get_name(code:string):string{
    const i:number= this.stfs.findIndex(obj => obj.code == code);
    // console.log(code,this.stfs);
    return this.stfs[i]?.sei;
  }              
  
}
