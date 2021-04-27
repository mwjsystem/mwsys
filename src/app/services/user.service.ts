import { Injectable } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { Apollo } from 'apollo-angular';
import { AbstractControl } from '@angular/forms';
import { Observable } from 'rxjs';
import gql from 'graphql-tag';

export class TmStmp {
  created_at: Date;
  created_by: string; 
  updated_at: Date;
  updated_by: string; 
  constructor(init?:Partial<TmStmp>) {
    Object.assign(this, init);
  }   
}
export class System {
  name:string;
  subname:string;
  maxmcd:string;
  maxdno:number;
  urischema:string;
  constructor(init?:Partial<System>) {
    Object.assign(this, init);
  } 
}


@Injectable({
  providedIn: 'root'
})
export class UserService {
  userInfo: {[key: string]: any} = {};
  compid:number;
  staff:mwI.Staff;
  tmstmp:TmStmp=new TmStmp();
  system:System=new System();
  
  constructor(public auth: AuthService,
              private apollo: Apollo) {
      const GetMast = gql`
      query get_system($id: smallint!){
        mssystem(where: {id: {_eq: $id}}) {
          name
          subname
          maxmcd
          maxdno
          urischema
        }
      }`;
      const GetMast2 = gql`
      query get_staff($id: smallint!, $mail: String!) {
        msstaff(where: {id: {_eq: $id}, mail: {_eq: $mail}}) {
          code
          sei
          mei
        }
      }`;
      this.auth.user$.subscribe(user => {
      this.userInfo = user;
      // console.log(this.userInfo);
      this.compid=this.userInfo['https://userids'][0];
      this.apollo.watchQuery<any>({
        query: GetMast, 
          variables: { 
            id : this.compid
          },
        })
        .valueChanges
        .subscribe(({ data }) => {
          this.system=data.mssystem[0];
        },(error) => {
          console.log('error query get_system', error);
        });
      this.apollo.watchQuery<any>({
        query: GetMast2, 
          variables: { 
            id : this.compid,
            mail : this.userInfo.email
          },
        })
        .valueChanges
        .subscribe(({ data }) => {
          this.staff=data.msstaff[0];
        },(error) => {
          console.log('error query get_system', error);
        });  
    })
   }

  logout(): void {
    // Call this to log the user out of the application
    this.auth.logout({ returnTo: window.location.origin });
  }

  getNumber(type:string,inc:number):Observable<number>{
    const UpdateNumber = gql`
    mutation getNextnum($id: smallint!, $typ: String!, $inc: bigint!) {
      update_trnumber(where: {id: {_eq: $id}, type: {_eq: $typ}}, _inc: {curnum: $inc}) {
        returning {
          curnum
        }
      }
    }`;
    let observable:Observable<number> = new Observable<number>(observer => {
      this.apollo.mutate<any>({
      mutation: UpdateNumber,
      variables: {
        id: this.compid,
        typ: type,
        inc: inc
      },
      }).subscribe(({ data }) => {
        console.log(data.update_trnumber.returning[0].curnum,data.update_trnumber.returning[0])
        observer.next(data.update_trnumber.returning[0].curnum);
      },(error) => {
        // this.toastr.error('採番エラー','採番タイプ' + type + 'の採番ができませんでした',
        //                     {closeButton: true,disableTimeOut: true,tapToDismiss: false});
        console.log('error mutation getNextnum', error);
        observer.next(-1);
      });
    });
    return observable;
  }

  editFrmval(frm:AbstractControl,fld:string):any{
    let val:any;  
    if(frm.value[fld]==""){
      val = null;
    }else{  
      val = frm.value[fld];
    }
    return val;
  }
 
  editFtel(frm:AbstractControl,fld1:string,fld2:string,fld3:string,fld4:string):any{
    let val:any=''; 
    if(frm.value[fld1]){
      val += frm.value[fld1].replace(/[^0-9]/g,'');
    }
    if(frm.value[fld2]){
      val += frm.value[fld2].replace(/[^0-9]/g,'');
    }
    if(frm.value[fld3]){
      val += frm.value[fld3].replace(/[^0-9]/g,'');
    }
    if(frm.value[fld4]){
      val += frm.value[fld4].replace(/[^0-9]/g,'');
    }
    return val;
  }  
  
  setTmstmp(obj:any):void {
    this.tmstmp.created_at = obj.created_at;
    this.tmstmp.created_by = obj.created_by;
    this.tmstmp.updated_at = obj.updated_at;
    this.tmstmp.updated_by = obj.updated_by;
    // console.log(obj,this.tmstmp);
  }

  formatDate(date):string {
    let lcdate:Date;
    if (date !=null ){
      lcdate = new Date(date);
    }else{
      lcdate = new Date();
    }
    const y = lcdate.getFullYear();
    const m = ('00' + (lcdate.getMonth()+1)).slice(-2);
    const d = ('00' + lcdate.getDate()).slice(-2);
    return (y + '-' + m + '-' + d);
  }
  convNumber(value:string|number):number{
    let ret:number;
    if(typeof value === 'string'){
      const val = value?.replace(/[^0-9０-９]/g, '').replace(/[０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      });   //数字のみ抽出して半角に変換
      ret = Number(val); 
    } else{
      ret = value;
    }
    return ret;
  }

  convUpper(value):string {
    // 全角は半角にして、大文字に変換
    const val = value.toUpperCase().replace(/[^A-ZＡ-Ｚ0-9０-９－-]/g, '').replace(/[０-９Ａ-Ｚ－]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);})
    return val;
  }

  pickObj(obj,flds:string[]){
    let pickobj={};
    flds.forEach(e => pickobj[e]=obj[e]);
    return pickobj;
  }
  // convNumber(value):any {
  //   const conv = value.replace(/[^0-9０-９]/g, '').replace(/[０-９]/g, function(s) {
  //     return String.fromCharCode(s.charCodeAt(0) - 65248);
  //   });   //数字のみ抽出
  //   return conv;
    
  // }

}

