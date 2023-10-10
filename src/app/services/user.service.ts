import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { FormArray } from "@angular/forms";
import { AuthService } from "@auth0/auth0-angular";
import { Apollo } from "apollo-angular";
import { AbstractControl } from "@angular/forms";
import { Observable, Subject } from "rxjs";
import gql from "graphql-tag";
import { ToastrService } from "ngx-toastr";
import { environment } from './../../environments/environment';

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
  providedIn: "root",
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
  manurl: string =
    "https://mwj001-my.sharepoint.com/:x:/g/personal/asago00_mwj001_onmicrosoft_com/EdJVQxKeKFRCr0sV1ebScewBQX6bPjCc8acDLL5VzwsIJQ?e=5HEIZ5";
  holidays: String[] = [];
  holidayFltr = (d: Date | null): boolean => {
    const day = (d || new Date()).getDay();
    // Prevent Saturday and Sunday from being selected.
    const ret = !this.holidays.includes(this.formatDate(d));
    return day !== 0 && day !== 6 && ret;
  };

  constructor(
    public auth: AuthService,
    private apollo: Apollo,
    private toastr: ToastrService,
    private router: Router
  ) {
    const GetMast = gql`
      query get_system($id: smallint!) {
        mssystem(where: { id: { _eq: $id } }) {
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
      }
    `;

    this.auth.user$.subscribe((user) => {
      this.userInfo = user;
      // console.log(this.userInfo);
      this.compid = this.userInfo["https://userids"][0];
      this.apollo
        .watchQuery<any>({
          query: GetMast,
          variables: {
            id: this.compid,
          },
        })
        .valueChanges.subscribe(
          ({ data }) => {
            this.system = data.mssystem[0];
          },
          (error) => {
            console.log("error query get_system", error);
          }
        );

      const color: string = localStorage.getItem(
        this.userInfo["nickname"] + "MWSYS_COLOR"
      );
      // console.log(color);
      if (color !== null) {
        var links = document.getElementsByTagName("link");
        for (var i = 0; i < links.length; i++) {
          var link = links[i];
          if (link.id == "themeAsset") {
            link.href =
              "https://unpkg.com/@angular/material/prebuilt-themes/" +
              color +
              ".css";
          }
        }
      }
      this.getHolidays();
      this.getStaff(this.userInfo["email"]).then(
        (result) => (this.staff = result)
      );
    });
    this.getTbldef();
  }

  logout(): void {
    // Call this to log the user out of the application
    this.auth.logout(
      {
        clientId: environment.AUTH0_CLIENT_ID,
        logoutParams: {
          returnTo: document.location.origin,
          localOnly: false
        }
      }
    );
  }

  async getStaff(mail: string): Promise<mwI.Staff> {
    const GetMast = gql`
      query get_staff($id: smallint!, $mail: String!) {
        msstaff(where: { id: { _eq: $id }, mail: { _eq: $mail } }) {
          code
          sei
          mei
          scode
        }
      }
    `;
    return new Promise((resolve) => {
      this.apollo
        .watchQuery<any>({
          query: GetMast,
          variables: {
            id: this.compid,
            mail: mail,
          },
        })
        .valueChanges.subscribe(
          ({ data }) => {
            return resolve(data.msstaff[0]);
          },
          (error) => {
            console.log("error query get_staff", error);
            return resolve(this.staff);
          }
        );
    });
  }
  async getNumber(type: string, inc: number, dno?: number): Promise<number> {
    const UpdateNumber = gql`
      mutation getNextnum($id: smallint!, $typ: String!, $inc: bigint!) {
        update_trnumber(
          where: { id: { _eq: $id }, type: { _eq: $typ } }
          _inc: { curnum: $inc }
        ) {
          returning {
            curnum
          }
        }
      }
    `;
    // let observable:Observable<number> = new Observable<number>(observer => {
    return new Promise((resolve) => {
      if (dno > 0) {
        return resolve(dno);
      } else {
        this.apollo
          .mutate<any>({
            mutation: UpdateNumber,
            variables: {
              id: this.compid,
              typ: type,
              inc: inc,
            },
          })
          .subscribe(
            ({ data }) => {
              return resolve(data.update_trnumber.returning[0].curnum);
              // observer.next(data.update_trnumber.returning[0].curnum);
              // observer.complete();
            },
            (error) => {
              this.toastr.error(
                "採番エラー",
                "番号種別" + type + "の採番ができませんでした",
                { closeButton: true, disableTimeOut: true, tapToDismiss: false }
              );
              console.log("error mutation getNextnum", error);
              return resolve(0);
              // observer.next(-1);
              // observer.complete();
            }
          );
      }
    });
    // return observable;
  }

  addCheckDigit(jan: number): number {
    let janstr = jan.toString();
    let evenNum = 0,
      oddNum = 0;
    for (var i = 0; i < janstr.length - 1; i++) {
      if (i % 2 == 0) {
        // 「奇数」かどうか（0から始まるため、iの偶数と奇数が逆）
        oddNum += parseInt(janstr[i]);
      } else {
        evenNum += parseInt(janstr[i]) * 3;
      }
    }
    let sumNum = oddNum + evenNum;
    let chkNum = sumNum % 10 === 0 ? 0 : 10 - (sumNum % 10);
    // console.log(jan,sumNum + "_" + chkNum);
    return parseInt(janstr + chkNum.toString());
  }

  addCheckDigit7(okrno: number): string {
    const chkNum: number = okrno % 7;
    return okrno.toString() + chkNum.toString();
  }

  editFrmval(frm: AbstractControl, fld: string): any {
    let val: any;
    // console.log(fld, frm.get(fld).value);
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
      val = frm.get(fld).value.toString().replace(/,/g, "");
    }
    return val;
  }

  editFtel(
    frm: AbstractControl,
    fld1: string,
    fld2?: string,
    fld3?: string,
    fld4?: string
  ): any {
    let val: any = "";
    if (frm.get(fld1).value) {
      val += frm.get(fld1).value.replace(/[^0-9]/g, "");
    }
    if (frm.get(fld2).value) {
      val += frm.get(fld2).value.replace(/[^0-9]/g, "");
    }
    if (frm.get(fld3).value) {
      val += frm.get(fld3).value.replace(/[^0-9]/g, "");
    }
    if (frm.get(fld4).value) {
      val += frm.get(fld4).value.replace(/[^0-9]/g, "");
    }
    return val;
  }

  setMail(m1: string, m2: string, m3: string, m4: string, m5: string): string {
    let mail: string = "";
    if (m1 !== null) {
      mail += m1 + "/";
    }
    if (m2 !== null) {
      mail += m2 + "/";
    }
    if (m3 !== null) {
      mail += m3 + "/";
    }
    if (m4 !== null) {
      mail += m4 + "/";
    }
    if (m5 !== null) {
      mail += m5 + "/";
    }
    return (mail || "").slice(0, -1);
  }

  setTel(t1: string, t2: string, t3: string, fax: string): string {
    let tel: string = "";
    if (t1 !== null) {
      tel += t1 + "/";
    }
    if (t2 !== null) {
      tel += t2 + "/";
    }
    if (t3 !== null) {
      tel += t3 + "/";
    }
    if (fax !== null) {
      tel += fax + "/";
    }
    return (tel || "").slice(0, -1);
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
    const m = ("00" + (lcdate.getMonth() + 1)).slice(-2);
    const d = ("00" + lcdate.getDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }

  toYYYYMM(date) {
    const y: string = date.getFullYear();
    const m: string = ("00" + (date.getMonth() + 1)).slice(-2);
    return y + m;
  }

  formatTime(date?): string {
    let lcdate: Date;
    if (date != null) {
      lcdate = new Date(date);
    } else {
      lcdate = new Date();
    }
    const y = lcdate.getFullYear();
    const m = ("00" + lcdate.getMonth()).slice(-2);
    const d = ("00" + lcdate.getDate()).slice(-2);
    const H = ("00" + lcdate.getHours()).slice(-2);
    const M = ("00" + lcdate.getMinutes()).slice(-2);

    return y + m + d + H + M;
  }
  convNumber(value: string | number): number {
    let ret: number;
    if (typeof value === "string") {
      const val = value
        ?.replace(/[^0-9０-９.．]/g, "")
        .replace(/[０-９．]/g, function (s) {
          return String.fromCharCode(s.charCodeAt(0) - 65248);
        }); //数字のみ抽出して半角に変換
      ret = Number(val);
    } else {
      ret = value;
    }
    return ret;
  }
  convHan(value: string): string {
    // 全角を半角に(メール用)
    const val = value
      .replace(/[^a-zA-Zａ-ｚＡ-Ｚ0-9０-９＠@－-＿_．.]/g, "")
      .replace(/[０-９ａ-ｚＡ-Ｚ＠－＿．]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      });
    return val;
  }
  convTel(value: string): string {
    // 全角を半角に(数字、－のみ)
    const val = value
      .replace(/[^0-9０-９－-]/g, "")
      .replace(/[０-９－]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      });
    return val;
  }
  convUpper(value: string): string {
    // 全角は半角にして、大文字に変換
    const val = value
      .toUpperCase()
      .replace(/[^A-ZＡ-Ｚ0-9０-９－-]/g, "")
      .replace(/[０-９Ａ-Ｚ－]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      });
    return val;
  }
  convKana(value: string): string {
    const kanaMap = {
      ガ: "ｶﾞ",
      ギ: "ｷﾞ",
      グ: "ｸﾞ",
      ゲ: "ｹﾞ",
      ゴ: "ｺﾞ",
      ザ: "ｻﾞ",
      ジ: "ｼﾞ",
      ズ: "ｽﾞ",
      ゼ: "ｾﾞ",
      ゾ: "ｿﾞ",
      ダ: "ﾀﾞ",
      ヂ: "ﾁﾞ",
      ヅ: "ﾂﾞ",
      デ: "ﾃﾞ",
      ド: "ﾄﾞ",
      バ: "ﾊﾞ",
      ビ: "ﾋﾞ",
      ブ: "ﾌﾞ",
      ベ: "ﾍﾞ",
      ボ: "ﾎﾞ",
      パ: "ﾊﾟ",
      ピ: "ﾋﾟ",
      プ: "ﾌﾟ",
      ペ: "ﾍﾟ",
      ポ: "ﾎﾟ",
      ヴ: "ｳﾞ",
      ヷ: "ﾜﾞ",
      ヺ: "ｦﾞ",
      ア: "ｱ",
      イ: "ｲ",
      ウ: "ｳ",
      エ: "ｴ",
      オ: "ｵ",
      カ: "ｶ",
      キ: "ｷ",
      ク: "ｸ",
      ケ: "ｹ",
      コ: "ｺ",
      サ: "ｻ",
      シ: "ｼ",
      ス: "ｽ",
      セ: "ｾ",
      ソ: "ｿ",
      タ: "ﾀ",
      チ: "ﾁ",
      ツ: "ﾂ",
      テ: "ﾃ",
      ト: "ﾄ",
      ナ: "ﾅ",
      ニ: "ﾆ",
      ヌ: "ﾇ",
      ネ: "ﾈ",
      ノ: "ﾉ",
      ハ: "ﾊ",
      ヒ: "ﾋ",
      フ: "ﾌ",
      ヘ: "ﾍ",
      ホ: "ﾎ",
      マ: "ﾏ",
      ミ: "ﾐ",
      ム: "ﾑ",
      メ: "ﾒ",
      モ: "ﾓ",
      ヤ: "ﾔ",
      ユ: "ﾕ",
      ヨ: "ﾖ",
      ラ: "ﾗ",
      リ: "ﾘ",
      ル: "ﾙ",
      レ: "ﾚ",
      ロ: "ﾛ",
      ワ: "ﾜ",
      ヲ: "ｦ",
      ン: "ﾝ",
      ァ: "ｧ",
      ィ: "ｨ",
      ゥ: "ｩ",
      ェ: "ｪ",
      ォ: "ｫ",
      ッ: "ｯ",
      ャ: "ｬ",
      ュ: "ｭ",
      ョ: "ｮ",
      "。": "｡",
      "、": "､",
      ー: "ｰ",
      "「": "｢",
      "」": "｣",
      "・": "･",
    };
    // 半角カナ、数字のみに変換
    let reg = new RegExp("(" + Object.keys(kanaMap).join("|") + ")", "g");
    const val = value
      .replace(/[^ｧ-ﾝﾞﾟ\-ァ-ンヴー0-9０-９]/g, "")
      .replace(/[０-９]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
      })
      .replace(reg, function (match) {
        return kanaMap[match];
      })
      .replace(/゛/g, "ﾞ")
      .replace(/゜/g, "ﾟ");
    return val;
  }
  getColor(mode: number): string {
    let ret: string = "";
    switch (mode) {
      case 1:
        ret = "accent";
        break;
      case 2:
        ret = "warn";
        break;
      case 3:
        ret = "primary";
        break;
      default:
        ret = "basic";
    }
    return ret;
  }
  disableMtbl(form) {
    (<FormArray>form.get("mtbl")).controls.forEach((control) => {
      control.disable();
      control.clearValidators();
    });
  }
  enableMtbl(form) {
    (<FormArray>form.get("mtbl")).controls.forEach((control) => {
      control.enable();
      control.clearValidators();
    });
  }
  openMst(func, value: string) {
    const url = this.router.createUrlTree(["/" + func, "3", value]);
    // window.open(url.toString(),null,'top=100,left=100');
    window.open(url.toString());
  }
  openFrm(typ: string, dno) {
    let func: string;
    switch (true) {
      case typ == "出荷":
        func = "/frmsales";
        break;
      case /引当/.test(typ):
        func = "/frmsales";
        break;
      case typ == "入荷予定":
        func = "/frmsupply";
        break;
      // case "受注返品":
      //   // color = 'slategray';
      //   break;
      // case "仕入":
      //   // color = 'mediumblue';
      //   break;
      // case "仕入返品":
      //   // color = 'navy';
      //   break;
      // case "展開先":
      //   // color = 'darkorange';
      //   break;
      // case "展開元":
      //   // color = 'orange';
      //   break;
      case typ == "移動入庫":
        func = "/frmmove";
        break;
      case typ == "移動出庫":
        func = "/frmmove";
        break;
      // case "破棄":
      //   // color = 'red';
      //   break;
      // case "発注外入荷":
      //   // color = 'green';
      //   break;
      // case "棚卸":
      //   // color = 'magenta';
      //   break;
      default:
      // color = 'black';
    }
    const url = this.router.createUrlTree([func, "3", dno]);
    // window.open(url.toString(),null,'top=100,left=100');
    window.open(url.toString());
  }
  openFrmCre(frm, dno, jdkey) {
    const url = this.router.createUrlTree([frm, "1", dno]);
    // window.open(url.toString() + '?stkey=' + jdkey ,null,'top=100,left=100');
    window.open(url.toString() + "?stkey=" + jdkey);
  }
  openRepstc(gcd, scd) {
    const url = this.router.createUrlTree(["/repstock"], {
      queryParams: { gcode: gcd, scode: scd },
    });
    // window.open(url.toString(),null,'top=100,left=100');
    window.open(url.toString());
  }
  confirmCan(dirty: boolean): boolean {
    let ret: boolean = false;
    if (dirty) {
      const msg: string =
        "このページを離れてもよろしいですか？" +
        "\n行った変更が保存されない可能性があります。";
      ret = confirm(msg);
    } else {
      ret = true;
    }
    return ret;
  }
  canEnter(e: KeyboardEvent): void {
    let element = e.target as HTMLElement;
    // console.log(element,element.tagName);
    if (element.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  }
  getTbldef(): void {
    const GetMast = gql`
      query get_tbldef {
        vtbldef {
          table_name
          column_name
          description
        }
      }
    `;
    this.apollo
      .watchQuery<any>({
        query: GetMast,
      })
      .valueChanges.subscribe(
        ({ data }) => {
          this.tbldef = data.vtbldef;
        },
        (error) => {
          console.log("error query getVtbldef", error);
        }
      );
  }
  getColtxt(tbnm: string, colnm: string): string {
    let ret: string = "";
    let i: number = this.tbldef.findIndex(
      (obj) => obj.table_name == tbnm && obj.column_name == colnm
    );
    // console.log(tbnm+"."+colnm,i);
    if (i > -1) {
      ret = this.tbldef[i]?.description.split("/n")[0];
    }
    return ret;
  }
  getValiderr(obj, i?: number): string {
    let ret: string = "";
    if (obj.required) {
      ret += "未入力です！";
    }
    if (obj.email) {
      ret += "メールの形式が不正です！";
    }
    if (obj.incorrect) {
      ret += "マスタ未登録です！";
    }
    if (obj.existed) {
      ret += "マスタ登録済です！";
    }
    // console.log(obj);
    if (i) {
      ret += "(明細" + i.toString() + "行目)";
    }
    return ret;
  }
  getHolidays() {
    const GetMast = gql`
      query get_msholiday($id: smallint!) {
        msholiday(where: { id: { _eq: $id } }) {
          holiday
        }
      }
    `;
    this.apollo
      .watchQuery<any>({
        query: GetMast,
        variables: {
          id: this.compid,
        },
      })
      .valueChanges.subscribe(
        ({ data }) => {
          data.msholiday.forEach((element) => {
            this.holidays.push(this.formatDate(new Date(element.holiday)));
          });
        },
        (error) => {
          console.log("error query holiday", error);
        }
      );
  }
  getNextday(tdy: Date) {
    let lcdate: Date = new Date(tdy);
    lcdate.setDate(lcdate.getDate() + 1);
    const day = lcdate.getDay();
    if (
      this.holidays.includes(this.formatDate(lcdate)) ||
      day == 0 ||
      day == 6
    ) {
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
    this.toastr.error(title, msg, {
      closeButton: true,
      disableTimeOut: true,
      tapToDismiss: false,
      positionClass: "toast-top-center",
    });
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
