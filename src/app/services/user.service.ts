import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { FormArray } from '@angular/forms';
import { AuthService } from '@auth0/auth0-angular';
import { Apollo } from 'apollo-angular';
import { AbstractControl } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import gql from 'graphql-tag';
import { ToastrService } from 'ngx-toastr';

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
  imgurl:string;
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
  tbldef:mwI.Tbldef[]=[];
  subject = new Subject<boolean>();
  observe = this.subject.asObservable();

  constructor(public auth: AuthService,
              private apollo: Apollo,
              private toastr: ToastrService,
              private router:Router) {
    const GetMast = gql`
    query get_system($id: smallint!){
      mssystem(where: {id: {_eq: $id}}) {
        name
        subname
        maxmcd
        maxdno
        urischema
        imgurl
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
    });
    this.getTbldef();
   }

  logout(): void {
    // Call this to log the user out of the application
    this.auth.logout({ returnTo: window.location.origin });
  }

  async getNumber(type:string,inc:number):Promise<number>{
    const UpdateNumber = gql`
    mutation getNextnum($id: smallint!, $typ: String!, $inc: bigint!) {
      update_trnumber(where: {id: {_eq: $id}, type: {_eq: $typ}}, _inc: {curnum: $inc}) {
        returning {
          curnum
        }
      }
    }`;
    // let observable:Observable<number> = new Observable<number>(observer => {
    return new Promise( resolve => {
      this.apollo.mutate<any>({
      mutation: UpdateNumber,
      variables: {
        id: this.compid,
        typ: type,
        inc: inc
      },
      }).subscribe(({ data }) => {
        return resolve(data.update_trnumber.returning[0].curnum);
        // observer.next(data.update_trnumber.returning[0].curnum);
        // observer.complete();
      },(error) => {
        this.toastr.error('採番エラー','採番タイプ' + type + 'の採番ができませんでした',
                            {closeButton: true,disableTimeOut: true,tapToDismiss: false});
        console.log('error mutation getNextnum', error);
        return resolve(0);
        // observer.next(-1);
        // observer.complete();
      });
    });
    // return observable;
  }

  addCheckDigit(jan:number):number{
    let janstr = jan.toString();
    let evenNum = 0, oddNum = 0;
    for (var i = 0; i < janstr.length - 1; i++) {
        if (i % 2 == 0) { // 「奇数」かどうか（0から始まるため、iの偶数と奇数が逆）
            oddNum += parseInt(janstr[i]);
        } else {
            evenNum += parseInt(janstr[i]) * 3;
        }
    }
    let sumNum = oddNum + evenNum;
    let chkNum = (sumNum % 10 === 0 ? 0 : 10 - sumNum % 10);
    // console.log(jan,sumNum + "_" + chkNum);
    return parseInt(janstr + chkNum.toString());
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
 
  editFtel(frm:AbstractControl,fld1:string,fld2?:string,fld3?:string,fld4?:string):any{
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
    this.subject.next(true);
    this.subject.complete();
    // console.log(obj,this.tmstmp);
  }

  formatDate(date?):string {
    let lcdate:Date;
    if (date !=null ){
      lcdate = new Date(date);
    }else{
      lcdate = new Date();
    }
    const y = lcdate.getFullYear();
    const m = ('00' + (lcdate.getMonth() + 1)).slice(-2);
    const d = ('00' + lcdate.getDate()).slice(-2);
    return (y + '-' + m + '-' + d);
  }

  toYYYYMM(date){
    const y:string = date.getFullYear();
    const m:string = ('00' + (date.getMonth() + 1)).slice(-2);    
    return (y + m);
  }

  formatTime(date?):string {
    let lcdate:Date;
    if (date !=null ){
      lcdate = new Date(date);
    }else{
      lcdate = new Date();
    }
    const y = lcdate.getFullYear();
    const m = ('00' + lcdate.getMonth()).slice(-2);
    const d = ('00' + lcdate.getDate()).slice(-2);
    const H = ('00' + lcdate.getHours()).slice(-2);
    const M = ('00' + lcdate.getMinutes()).slice(-2);

    return (y + m + d + H + M);
  }
  convNumber(value:string|number):number{
    let ret:number;
    if(typeof value === 'string'){
      const val = value?.replace(/[^0-9０-９.．]/g, '').replace(/[０-９．]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      });   //数字のみ抽出して半角に変換
      ret = Number(val); 
    } else{
      ret = value;
    }
    return ret;
  }
  convHan(value):string {
    // 全角を半角に(メール用)
    const val = value.replace(/[^a-zA-Zａ-ｚＡ-Ｚ0-9０-９＠@－-＿_．.]/g, '').replace(/[０-９ａ-ｚＡ-Ｚ＠－＿．]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);})
    return val;
  }
  convTel(value):string {
    // 全角を半角に(数字、－のみ)
    const val = value.replace(/[^0-9０-９－-]/g, '').replace(/[０-９－]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);})
    return val;
  }
  convUpper(value):string {
    // 全角は半角にして、大文字に変換
    const val = value.toUpperCase().replace(/[^A-ZＡ-Ｚ0-9０-９－-]/g, '').replace(/[０-９Ａ-Ｚ－]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);})
    return val;
  }
  convKana(value):string {
      const kanaMap = {
         "ガ": "ｶﾞ", "ギ": "ｷﾞ", "グ": "ｸﾞ", "ゲ": "ｹﾞ", "ゴ": "ｺﾞ",
         "ザ": "ｻﾞ", "ジ": "ｼﾞ", "ズ": "ｽﾞ", "ゼ": "ｾﾞ", "ゾ": "ｿﾞ",
         "ダ": "ﾀﾞ", "ヂ": "ﾁﾞ", "ヅ": "ﾂﾞ", "デ": "ﾃﾞ", "ド": "ﾄﾞ",
         "バ": "ﾊﾞ", "ビ": "ﾋﾞ", "ブ": "ﾌﾞ", "ベ": "ﾍﾞ", "ボ": "ﾎﾞ",
         "パ": "ﾊﾟ", "ピ": "ﾋﾟ", "プ": "ﾌﾟ", "ペ": "ﾍﾟ", "ポ": "ﾎﾟ",
         "ヴ": "ｳﾞ", "ヷ": "ﾜﾞ", "ヺ": "ｦﾞ",
         "ア": "ｱ", "イ": "ｲ", "ウ": "ｳ", "エ": "ｴ", "オ": "ｵ",
         "カ": "ｶ", "キ": "ｷ", "ク": "ｸ", "ケ": "ｹ", "コ": "ｺ",
         "サ": "ｻ", "シ": "ｼ", "ス": "ｽ", "セ": "ｾ", "ソ": "ｿ",
         "タ": "ﾀ", "チ": "ﾁ", "ツ": "ﾂ", "テ": "ﾃ", "ト": "ﾄ",
         "ナ": "ﾅ", "ニ": "ﾆ", "ヌ": "ﾇ", "ネ": "ﾈ", "ノ": "ﾉ",
         "ハ": "ﾊ", "ヒ": "ﾋ", "フ": "ﾌ", "ヘ": "ﾍ", "ホ": "ﾎ",
         "マ": "ﾏ", "ミ": "ﾐ", "ム": "ﾑ", "メ": "ﾒ", "モ": "ﾓ",
         "ヤ": "ﾔ", "ユ": "ﾕ", "ヨ": "ﾖ",
         "ラ": "ﾗ", "リ": "ﾘ", "ル": "ﾙ", "レ": "ﾚ", "ロ": "ﾛ",
         "ワ": "ﾜ", "ヲ": "ｦ", "ン": "ﾝ",
         "ァ": "ｧ", "ィ": "ｨ", "ゥ": "ｩ", "ェ": "ｪ", "ォ": "ｫ",
         "ッ": "ｯ", "ャ": "ｬ", "ュ": "ｭ", "ョ": "ｮ",
         "。": "｡", "、": "､", "ー": "ｰ", "「": "｢", "」": "｣", "・": "･"
    }
    // 半角カナ、数字のみに変換
    let reg = new RegExp('(' + Object.keys(kanaMap).join('|') + ')', 'g');
    const val = value.replace(/[^ｧ-ﾝﾞﾟ\-ァ-ンヴー0-9０-９]/g, '').replace(/[０-９]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);}).replace(reg, function (match) {
                return kanaMap[match];
            })
            .replace(/゛/g, 'ﾞ')
            .replace(/゜/g, 'ﾟ');
    return val;
  }
  pickObj(obj,flds:string[]){
    let pickobj={};
    flds.forEach(e => pickobj[e]=obj[e]);
    return pickobj;
  }
  pickObjArr(objarr,flds:string[]){
    let pickarr=[];
    objarr.forEach(obj =>{
        let pickobj={};
        flds.forEach(e => pickobj[e]=obj[e]);
        pickarr.push(pickobj);    
    });
    return pickarr;
  }
  disable_mtbl(form) {
    (<FormArray>form.get('mtbl'))
      .controls
      .forEach(control => {
        control.disable();
      })
  } 
  enable_mtbl(form) {
    (<FormArray>form.get('mtbl'))
      .controls
      .forEach(control => {
        control.enable();
      })
  }
  openMst(func,value){
    const url = this.router.createUrlTree(['/'+func,'3',value]);
    window.open(url.toString(),null,'top=100,left=100');
  }
  openFrmsup(hdno,jdkey){
    const url = this.router.createUrlTree(['/frmsupply','1',hdno]);
    window.open(url.toString() + '?stkey=' + jdkey ,null,'top=100,left=100');
  }
  confirmCan(dirty:boolean):boolean{
      let ret:boolean=false;
      if (dirty) {
        const msg:string = 'このページを離れてもよろしいですか？'
            + '\n行った変更が保存されない可能性があります。';
        ret = confirm(msg);        
      }else{
        ret=true;
      } 
      return ret;
  }
  getTbldef():void{
    const GetMast = gql`
      query get_tbldef{
        vtbldef {
          table_name
          column_name
          description
        }
      }`;
      this.apollo.watchQuery<any>({
          query: GetMast 
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.tbldef=data.vtbldef;
      },(error) => {
        console.log('error query getVtbldef', error);
      });
  }
  getColtxt(tbnm:string,colnm:string):string{
    let i:number = this.tbldef.findIndex(obj => obj.table_name== tbnm && obj.column_name == colnm);
    return this.tbldef[i].description.split('/n')[0];
  }
  getValiderr(obj):string{
    let ret:string="";
    if ( obj.required ){
      ret += "未入力です！";      
    }
    if ( obj.email ){
      ret += "メールの形式が不正です！";      
    }


    return ret;
  }
}

