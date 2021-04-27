import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class StaffService {

  public tcds: mwI.Sval[]=[];
  public stfs: mwI.Staff[]=[];
  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

  get_staff():void {
    const GetMast = gql`
    query get_staff($id: smallint!){
      msstaff(where: {id: {_eq: $id}}) {
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
        this.stfs=data.msstaff;
        data.msstaff.forEach(e => {
          this.tcds.push({value:e.code,viewval:e.sei + (e.mei ?? "")}); //e.meiがnull等の時は、''を結合
        });
      },(error) => {
        console.log('error query get_staff', error);
      });
  }  
  get_name(code:number):string{
    const i:number= this.stfs.findIndex(obj => obj.code == code);
    return this.stfs[i].sei;
  }              
  
}
