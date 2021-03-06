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
  constructor(init?: Partial<TmStmp>) {
    Object.assign(this, init);
  }
}
export class System {
  name: string;
  subname: string;
  maxmcd: string;
  maxdno: number;
  urischema: string;
  imgurl: string;
  currate: number;
  mtax: string;
  tnk1txt: number;
  tnk2txt: number;
  tnk3txt: number;
  tnk4txt: number;
  tnk5txt: number;
  tnk6txt: number;
  tnk7txt: number;
  tnk8txt: number;
  tnk9txt: number;
  constructor(init?: Partial<System>) {
    Object.assign(this, init);
  }
}


@Injectable({
  providedIn: 'root'
})
export class UserService {
  userInfo: { [key: string]: any } = {};
  compid: number;
  staff: mwI.Staff;
  tmstmp: TmStmp = new TmStmp();
  system: System = new System();
  tbldef: mwI.Tbldef[] = [];
  subject = new Subject<boolean>();
  observe = this.subject.asObservable();
  holidays: String[] = [];
  holidayFltr = (d: Date | null): boolean => {
    const day = (d || new Date()).getDay();
    // Prevent Saturday and Sunday from being selected.
    const ret = !this.holidays.includes(this.formatDate(d));
    return day !== 0 && day !== 6 && ret;
  }

  constructor(public auth: AuthService,
    private apollo: Apollo,
    private toastr: ToastrService,
    private router: Router) {
    const GetMast = gql`
    query get_system($id: smallint!){
      mssystem(where: {id: {_eq: $id}}) {
        name
        subname
        maxmcd
        maxdno
        urischema
        imgurl
        currate
        mtax
        tnk1txt
        tnk2txt
        tnk3txt
        tnk4txt
        tnk5txt
        tnk6txt
        tnk7txt
        tnk8txt
        tnk9txt
      }
    }`;

    this.auth.user$.subscribe(user => {
      this.userInfo = user;
      // console.log(this.userInfo);
      this.compid = this.userInfo['https://userids'][0];
      this.apollo.watchQuery<any>({
        query: GetMast,
        variables: {
          id: this.compid
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.system = data.mssystem[0];
        }, (error) => {
          console.log('error query get_system', error);
        });

      const color: string = localStorage.getItem(user.nickname + 'MWSYS_COLOR');
      // console.log(color);
      if (color !== null) {
        var links = document.getElementsByTagName("link");
        for (var i = 0; i < links.length; i++) {
          var link = links[i];
          if (link.id == 'themeAsset') {
            link.href = 'https://unpkg.com/@angular/material/prebuilt-themes/' + color + '.css';
          }
        }
      }
      this.getHolidays();
      this.getStaff(this.userInfo.email).then(result => this.staff = result);
    });
    this.getTbldef();
  }

  logout(): void {
    // Call this to log the user out of the application
    this.auth.logout({ returnTo: window.location.origin });
  }

  async getStaff(mail: string): Promise<mwI.Staff> {
    const GetMast = gql`
    query get_staff($id: smallint!, $mail: String!) {
      msstaff(where: {id: {_eq: $id}, mail: {_eq: $mail}}) {
        code
        sei
        mei
        scode
      }
    }`;
    return new Promise(resolve => {
      this.apollo.watchQuery<any>({
        query: GetMast,
        variables: {
          id: this.compid,
          mail: mail
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          return resolve(data.msstaff[0]);
        }, (error) => {
          console.log('error query get_staff', error);
          return resolve(this.staff);
        });
    });
  }
  async getNumber(type: string, inc: number, dno?: number): Promise<number> {
    const UpdateNumber = gql`
    mutation getNextnum($id: smallint!, $typ: String!, $inc: bigint!) {
      update_trnumber(where: {id: {_eq: $id}, type: {_eq: $typ}}, _inc: {curnum: $inc}) {
        returning {
          curnum
        }
      }
    }`;
    // let observable:Observable<number> = new Observable<number>(observer => {
    return new Promise(resolve => {
      if (dno > 0) {
        return resolve(dno);
      } else {
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
        }, (error) => {
          this.toastr.error('???????????????', '???????????????' + type + '????????????????????????????????????',
            { closeButton: true, disableTimeOut: true, tapToDismiss: false });
          console.log('error mutation getNextnum', error);
          return resolve(0);
          // observer.next(-1);
          // observer.complete();
        });
      }

    });
    // return observable;
  }

  addCheckDigit(jan: number): number {
    let janstr = jan.toString();
    let evenNum = 0, oddNum = 0;
    for (var i = 0; i < janstr.length - 1; i++) {
      if (i % 2 == 0) { // ???????????????????????????0????????????????????????i???????????????????????????
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

  addCheckDigit7(okrno: number): string {
    const chkNum: number = okrno % 7;
    return okrno.toString() + chkNum.toString();
  }

  editFrmval(frm: AbstractControl, fld: string): any {
    let val: any;
    if (frm.get(fld).value == "") {
      val = null;
    } else {
      val = frm.get(fld).value;
    }
    return val;
  }
  editFrmday(frm: AbstractControl, fld: string): any {
    // console.log(fld, frm.get(fld).value);
    let val: any;
    if (frm.get(fld).value == null) {
      val = null;
    } else {
      val = this.formatDate(frm.get(fld).value);
    }
    return val;
  }
  editDay(frm: AbstractControl, fld: string): any {
    let val: any;
    if (frm.get(fld).value == null) {
      val = "2000-01-01";
    } else {
      val = this.formatDate(frm.get(fld).value);
    }
    // console.log(frm.get(fld).value,val);
    return val;
  }

  editInt(frm: AbstractControl, fld: string): any {
    let val: any;
    if (frm.get(fld).value == null) {
      val = null;
    } else if (frm.get(fld).value == "") {
      val = null;
    } else {
      val = frm.get(fld).value.toString().replace(/,/g, '');
    }
    return val;
  }

  editFtel(frm: AbstractControl, fld1: string, fld2?: string, fld3?: string, fld4?: string): any {
    let val: any = '';
    if (frm.get(fld1).value) {
      val += frm.get(fld1).value.replace(/[^0-9]/g, '');
    }
    if (frm.get(fld2).value) {
      val += frm.get(fld2).value.replace(/[^0-9]/g, '');
    }
    if (frm.get(fld3).value) {
      val += frm.get(fld3).value.replace(/[^0-9]/g, '');
    }
    if (frm.get(fld4).value) {
      val += frm.get(fld4).value.replace(/[^0-9]/g, '');
    }
    return val;
  }

  setTmstmp(obj: any): void {
    this.tmstmp.created_at = obj.created_at;
    this.tmstmp.created_by = obj.created_by;
    this.tmstmp.updated_at = obj.updated_at;
    this.tmstmp.updated_by = obj.updated_by;
    this.subject.next(true);
    // this.subject.complete();
    // console.log(obj,this.tmstmp);
  }

  formatDate(date?): string {
    let lcdate: Date;
    if (date != null) {
      lcdate = new Date(date);
    } else {
      lcdate = new Date();
    }
    const y = lcdate.getFullYear();
    const m = ('00' + (lcdate.getMonth() + 1)).slice(-2);
    const d = ('00' + lcdate.getDate()).slice(-2);
    return (y + '-' + m + '-' + d);
  }

  toYYYYMM(date) {
    const y: string = date.getFullYear();
    const m: string = ('00' + (date.getMonth() + 1)).slice(-2);
    return (y + m);
  }

  formatTime(date?): string {
    let lcdate: Date;
    if (date != null) {
      lcdate = new Date(date);
    } else {
      lcdate = new Date();
    }
    const y = lcdate.getFullYear();
    const m = ('00' + lcdate.getMonth()).slice(-2);
    const d = ('00' + lcdate.getDate()).slice(-2);
    const H = ('00' + lcdate.getHours()).slice(-2);
    const M = ('00' + lcdate.getMinutes()).slice(-2);

    return (y + m + d + H + M);
  }
  convNumber(value: string | number): number {
    let ret: number;
    if (typeof value === 'string') {
      const val = value?.replace(/[^0-9???-???.???]/g, '').replace(/[???-??????]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      });   //???????????????????????????????????????
      ret = Number(val);
    } else {
      ret = value;
    }
    return ret;
  }
  convHan(value): string {
    // ??????????????????(????????????)
    const val = value.replace(/[^a-zA-Z???-??????-???0-9???-??????@???-???_???.]/g, '').replace(/[???-??????-??????-???????????????]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);
    })
    return val;
  }
  convTel(value): string {
    // ??????????????????(??????????????????)
    const val = value.replace(/[^0-9???-??????-]/g, '').replace(/[???-??????]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);
    })
    return val;
  }
  convUpper(value): string {
    // ?????????????????????????????????????????????
    const val = value.toUpperCase().replace(/[^A-Z???-???0-9???-??????-]/g, '').replace(/[???-??????-??????]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);
    })
    return val;
  }
  convKana(value): string {
    const kanaMap = {
      "???": "??????", "???": "??????", "???": "??????", "???": "??????", "???": "??????",
      "???": "??????", "???": "??????", "???": "??????", "???": "??????", "???": "??????",
      "???": "??????", "???": "??????", "???": "??????", "???": "??????", "???": "??????",
      "???": "??????", "???": "??????", "???": "??????", "???": "??????", "???": "??????",
      "???": "??????", "???": "??????", "???": "??????", "???": "??????", "???": "??????",
      "???": "??????", "???": "??????", "???": "??????",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???",
      "???": "???", "???": "???", "???": "???", "???": "???", "???": "???", "???": "???"
    }
    // ????????????????????????????????????
    let reg = new RegExp('(' + Object.keys(kanaMap).join('|') + ')', 'g');
    const val = value.replace(/[^???-?????????\-???-?????????0-9???-???]/g, '').replace(/[???-???]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 65248);
    }).replace(reg, function (match) {
      return kanaMap[match];
    })
      .replace(/???/g, '???')
      .replace(/???/g, '???');
    return val;
  }

  disable_mtbl(form) {
    (<FormArray>form.get('mtbl'))
      .controls
      .forEach(control => {
        control.disable();
        control.clearValidators();
      })
  }
  enable_mtbl(form) {
    (<FormArray>form.get('mtbl'))
      .controls
      .forEach(control => {
        control.enable();
        control.clearValidators();
      })
  }
  openMst(func, value) {
    const url = this.router.createUrlTree(['/' + func, '3', value]);
    // window.open(url.toString(),null,'top=100,left=100');
    window.open(url.toString());
  }
  openFrm(typ: string, dno) {
    let func: string;
    switch (true) {
      case typ == "??????":
        func = '/frmsales';
        break;
      case /??????/.test(typ):
        func = '/frmsales';
        break;
      case typ == "????????????":
        func = '/frmsupply';
        break;
      // case "????????????":
      //   // color = 'slategray';
      //   break;
      // case "??????":
      //   // color = 'mediumblue';
      //   break;
      // case "????????????":
      //   // color = 'navy';
      //   break;
      // case "?????????":
      //   // color = 'darkorange';
      //   break;
      // case "?????????":
      //   // color = 'orange';
      //   break;
      // case "????????????":
      //   // color = 'blue';
      //   break;
      // case "????????????":
      //   // color = 'royalblue';
      //   break;
      // case "??????":
      //   // color = 'red';
      //   break;
      // case "???????????????":
      //   // color = 'green';
      //   break;
      // case "??????":
      //   // color = 'magenta';
      //   break;  
      default:
      // color = 'black';
    }
    const url = this.router.createUrlTree([func, '3', dno]);
    // window.open(url.toString(),null,'top=100,left=100');
    window.open(url.toString());
  }
  openFrmsup(dno, jdkey) {
    const url = this.router.createUrlTree(['/frmsupply', '1', dno]);
    // window.open(url.toString() + '?stkey=' + jdkey ,null,'top=100,left=100');
    window.open(url.toString() + '?stkey=' + jdkey);
  }
  openRepstc(gcd, scd) {
    const url = this.router.createUrlTree(['/repstock'], { queryParams: { gcode: gcd, scode: scd } });
    // window.open(url.toString(),null,'top=100,left=100');
    window.open(url.toString());
  }
  confirmCan(dirty: boolean): boolean {
    let ret: boolean = false;
    if (dirty) {
      const msg: string = '??????????????????????????????????????????????????????'
        + '\n???????????????????????????????????????????????????????????????';
      ret = confirm(msg);
    } else {
      ret = true;
    }
    return ret;
  }
  getTbldef(): void {
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
        this.tbldef = data.vtbldef;
      }, (error) => {
        console.log('error query getVtbldef', error);
      });
  }
  getColtxt(tbnm: string, colnm: string): string {
    let i: number = this.tbldef.findIndex(obj => obj.table_name == tbnm && obj.column_name == colnm);
    // console.log(tbnm+"."+colnm,i);    
    return this.tbldef[i]?.description.split('/n')[0];
  }
  getValiderr(obj, i?: number): string {
    let ret: string = "";
    if (obj.required) {
      ret += "??????????????????";
    }
    if (obj.email) {
      ret += "????????????????????????????????????";
    }
    if (obj.incorrect) {
      ret += "???????????????????????????";
    }
    if (obj.existed) {
      ret += "???????????????????????????";
    }
    // console.log(obj);
    if (i) {
      ret += "(??????" + i.toString() + "??????)"
    }
    return ret;
  }
  getHolidays() {
    const GetMast = gql`
      query get_msholiday($id: smallint!){
        msholiday(where: {id: {_eq: $id}}) {
          holiday
        }
      }`;
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: {
        id: this.compid
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        data.msholiday.forEach(element => {
          this.holidays.push(this.formatDate(new Date(element.holiday)));
        });
      }, (error) => {
        console.log('error query holiday', error);
      });
  }
  getNextday(tdy: Date) {
    let lcdate: Date = new Date(tdy);
    lcdate.setDate(lcdate.getDate() + 1);
    const day = lcdate.getDay();
    if (this.holidays.includes(this.formatDate(lcdate)) || day == 0 || day == 6) {
      lcdate = this.getNextday(lcdate);
    }
    return lcdate;
  }
  getLastMonth(date: Date) {
    date.setDate(date.getDate() - 30);
    const day = date.getDay();
    if (this.holidays.includes(this.formatDate(date)) || day == 0 || day == 6) {
      date = this.getNextday(date);
    }
    return date;
  }
  toastErr(title, msg) {
    this.toastr.error(title, msg, { closeButton: true, disableTimeOut: true, tapToDismiss: false });
  }
  toastWar(msg) {
    this.toastr.warning(msg);
  }
  toastSuc(msg) {
    this.toastr.success(msg);
  }
  toastInf(msg) {
    this.toastr.info(msg);
  }
}

