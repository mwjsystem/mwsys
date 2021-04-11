import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})

export class OkuriService {
  
  hokuri: mwI.Hokuri[]=[];
  haisou: mwI.Haisou[]=[];
  hktime: mwI.Hktime[]=[];
  
  constructor(private usrsrv: UserService,
              private apollo: Apollo) { }

  get_hokuri():void {
    const GetMast = gql`
      query get_okuri($id: smallint!) {
        mshokuri(where: {id: {_eq: $id}}) {
          code
          name
          htype
          binshu
          mtchaku
          daibiki
          scode
          csvimp
          cuscode
          order 
          hscode
          onmin
          onmax
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
        this.hokuri=data.mshokuri;
      },(error) => {
        console.log('error query get_hokuri', error);
      });
  }

  get_haisou():void {
    const GetMast = gql`
    query get_haisou($id: smallint!) {
      mshaisou(where: {id: {_eq: $id}}) {
        code
        name
        url
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
        this.haisou=data.mshaisou;
      },(error) => {
        console.log('error query get_haisou', error);
      });
  } 

  get_hktime():void {
    const GetMast = gql`
    query get_hktime($id: smallint!){
      mshktime(where: {id: {_eq: $id}}) {
        hscode
        code
        name
        bunrui  
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
        this.hktime=data.mshktime;
      },(error) => {
        console.log('error query get_hktime', error);
      });
  }

}
