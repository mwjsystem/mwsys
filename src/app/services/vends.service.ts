import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VendsService {

  vends:  mwI.Vendor[]=[];
  public subject = new Subject<mwI.Vendor[]>();
  public observe = this.subject.asObservable();  

  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

get_vendors(): void{
    const GetMast = gql`
    query get_vendors($id: smallint!) {
      msvendor(where: {id: {_eq: $id}}, order_by: {code: asc}) {
        code
        adrname
        kana
        tel
        tel2
        tel3
        fax
        mail1
        mail2
        mail3
        mail4
        mail5
        tanto
        url
        del
        ftel
        zip
        region
        local
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
        this.vends=data.msvendor;
        this.subject.next(this.vends);
      },(error) => {
        console.log('error query get_vendors', error);
      });
  }

  get_vcdtxt(vcd:string):string{
    const i:number = this.vends.findIndex(obj => obj.code == vcd);
    let vcdtxt:string="";
    if(i > -1 ){
      vcdtxt = this.vends[i].adrname;
    } else {
      vcdtxt="";  
    }
    return vcdtxt;
  }
}
