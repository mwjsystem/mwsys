import { Component, OnInit, AfterViewInit, ViewEncapsulation, ViewChildren, QueryList, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';

import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.mstm';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { BunshoService } from './../services/bunsho.service';
import { OkuriService } from './../services/okuri.service';
import { StaffService } from './../services/staff.service';
import { MembsService } from './membs.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { AdredaComponent } from './../share/adreda/adreda.component';
import { AddressComponent } from './../share/address/address.component';
import { MsprocComponent } from './../share/msproc/msproc.component';

class Sval {
  value: string;
  viewval: string;
  dis: boolean;
}

@Component({
  selector: 'app-mstmember',
  templateUrl: './mstmember.component.html',
  styleUrls: ['./../app.component.scss']
})
export class MstmemberComponent implements OnInit, AfterViewInit {
  @ViewChildren(AddressComponent)
  private children: QueryList<AddressComponent>;
  form: FormGroup;
  mcd: string = "";
  mode: number = 3;

  gadrVal: Sval[] = [
    { value: "0", viewval: "基本住所", dis: false },
    { value: "1", viewval: "その他住所", dis: true },
    { value: "2", viewval: "別納", dis: false }];
  flgadr1: number = 1; //その他住所フラグ 1：未登録、2：登録済
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  constructor(public usrsrv: UserService,
    private fb: FormBuilder,
    private title: Title,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    public bunsrv: BunruiService,
    public bnssrv: BunshoService,
    public stfsrv: StaffService,
    public okrsrv: OkuriService,
    public memsrv: MembsService,
    private apollo: Apollo,
    private overlay: Overlay,
    private cdRef: ChangeDetectorRef,
    private zone: NgZone) {
    this.title.setTitle('顧客マスタ(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({});
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.form.addControl('base', new FormGroup({
      sei: new FormControl('', Validators.required),
      mei: new FormControl(''),
      kana: new FormControl('', Validators.required),
      tankakbn: new FormControl('', Validators.required),
      pcode: new FormControl(''),
      hcode: new FormControl(''),
      jcode: new FormControl(''),
      mtax: new FormControl('', Validators.required),
      daibunrui: new FormControl(''),
      chubunrui: new FormControl(''),
      shobunrui: new FormControl(''),
      tcode1: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      sptnkbn: new FormControl(''),
      htime: new FormControl(''),
      ntype: new FormControl(''),
      tntype: new FormControl(''),
      webid: new FormControl(''),
      ryoate: new FormControl(''),
      del: new FormControl(''),
      dmemo: new FormControl(''),
      jan: new FormControl(''),
      memo: new FormControl(''),

      torikbn: new FormControl(''),
      sime: new FormControl(''),
      site: new FormControl(''),
      inday: new FormControl(''),
      scde: new FormControl(''),
      sscode: new FormControl(''),

      mail: new FormControl('', Validators.email),
      mail2: new FormControl('', Validators.email),
      mail3: new FormControl('', Validators.email),
      mail4: new FormControl('', Validators.email),
      mail5: new FormControl('', Validators.email),
      mtgt1: new FormControl(''),
      mtgt2: new FormControl(''),
      mtgt3: new FormControl(''),
      mtgt4: new FormControl(''),
      mtgt5: new FormControl(''),
      gadr: new FormControl('')
    }));
    this.bunsrv.getBunrui();
    this.okrsrv.getHokuri();
    this.bnssrv.getBuntype();

  }

  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.memsrv.getMembers().then(result => {
      this.overlayRef.detach();
    });
    this.route.paramMap.subscribe((params: ParamMap) => {
      if (params.get('mode') === null) {
        this.mode = 3;
      } else {
        this.mode = +params.get('mode');
      }
      this.refresh();
      if (params.get('mcd') === null) {
        // this.mcd = '読込中です！';
        // this.refresh();
      } else {
        //１件分だけ先に読込
        this.mcd = params.get('mcd');
        this.getMember(this.mcd);
      }
    });
  }

  diaBetsu(): void {
    if (this.checkMcode(this.mcd)) {
      let dialogConfig = new MatDialogConfig();
      dialogConfig.autoFocus = true;
      dialogConfig.data = {
        mcode: this.mcd + '(' + this.memsrv.getMcdtxt(this.mcd) + ')',
        flg: false
      };
      let dialogRef = this.dialog.open(AdredaComponent, dialogConfig);
    }
  }

  diaProc(): void {
    if (this.checkMcode(this.mcd)) {
      let dialogConfig = new MatDialogConfig();
      dialogConfig.autoFocus = true;
      dialogConfig.data = {
        mcode: this.mcd + '(' + this.memsrv.getMcdtxt(this.mcd) + ')',
        mode: this.mode
      };
      let dialogRef = this.dialog.open(MsprocComponent, dialogConfig);
    }
  }

  mcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);

    this.cdRef.detach();
    dialogRef.afterClosed().subscribe(
      data => {
        this.cdRef.reattach();
        if (typeof data != 'undefined') {
          this.mcd = data.mcode;
        }
        this.getMember(this.mcd);
      }
    );
  }

  canEnter(e: KeyboardEvent): void {
    let element = e.target as HTMLElement;
    if (element.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  }
  refresh(): void {
    // if( this.checkMcode(this.mcd) ){
    //   this.get_member(+this.mcd);
    // }
    if (this.mode == 3 || this.mode == 4) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    this.cdRef.detectChanges();
  }

  checkMcode(mcode: string): boolean {
    let flg: boolean;
    if (mcode == "") {
      flg = false;
    } else if (this.mode > 1) {
      if (this.memsrv.membs.length == 0) {
        flg = true;
      } else {
        let lcmcode: string = this.usrsrv.convUpper(mcode);
        let i: number = this.memsrv.membs.findIndex(obj => obj.mcode == lcmcode);
        if (i > -1) {
          this.mcd = lcmcode;
          flg = true;
        } else {
          // if( mcode.toString().indexOf('未登録') == -1 && mcode.toString().indexOf('読込') == -1 && mcode !== '' ){
          //   // this.mcd = lcmcode + '  未登録';
          // }
          this.usrsrv.toastWar("顧客コード" + mcode + "は登録されていません");
          this.form.reset();
          history.replaceState('', '', './mstmember');
          flg = false;
        }
      }
    } else {
      let lcmcode: string = this.usrsrv.convUpper(mcode);
      let i: number = this.memsrv.membs.findIndex(obj => obj.mcode == lcmcode);
      if (i > -1) {
        this.usrsrv.toastWar("顧客コード" + mcode + "は登録済です");
      }
      flg = false;
    }
    return flg;
  }

  getMember(mcode: string) {
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    if (this.checkMcode(mcode)) {
      this.apollo.watchQuery<any>({
        query: Query.GetMast1,
        variables: {
          id: this.usrsrv.compid,
          mcd: mcode
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          this.form.reset();
          if (data.msmember_by_pk == null) {
            this.usrsrv.toastWar("顧客コード" + mcode + "は登録されていません");
            history.replaceState('', '', './mstmember');
          } else {
            let member: mwI.Member = data.msmember_by_pk;
            this.form.get('base').patchValue(member);
            this.usrsrv.setTmstmp(member);
            this.memsrv.mcode = mcode;
            this.memsrv.edas = [];
            this.memsrv.adrs = [];
            for (let j = 0; j < member.msmadrs.length; j++) {
              this.memsrv.adrs.push(member.msmadrs[j]);
              if (member.msmadrs[j].eda > 1) {
                this.memsrv.edas.push({
                  eda: member.msmadrs[j].eda,
                  zip: member.msmadrs[j].zip,
                  region: member.msmadrs[j].region,
                  local: member.msmadrs[j].local,
                  street: member.msmadrs[j].street,
                  extend: member.msmadrs[j].extend,
                  extend2: member.msmadrs[j].extend2,
                  adrname: member.msmadrs[j].adrname,
                  tel: this.usrsrv.setTel(member.msmadrs[j].tel, member.msmadrs[j].tel2, member.msmadrs[j].tel3, member.msmadrs[j].fax)
                });
              }
            }
            this.form.get('addr0').patchValue(member.msmadrs[0]);
            //その他住所があれば、
            let j: number = member.msmadrs.findIndex(obj => obj.eda == 1);
            if (j > -1) {
              this.form.get('addr1').patchValue(member.msmadrs[j]);
              this.flgadr1 = 2;
              this.gadrVal[1].dis = false;
            } else {
              this.form.get('addr1').reset();
              this.flgadr1 = 1;
              this.gadrVal[1].dis = true;
            }
            this.mcd = mcode;
            if (member.del == true) {
              this.mode = 4;
            } else {
              this.mode = 3;
            }
            this.overlayRef.detach();
            this.refresh();
            // console.log("get_member");
            this.cdRef.detectChanges();
            history.replaceState('', '', './mstmember/' + this.mode + '/' + this.mcd);
          }
        }, (error) => {
          console.log('error query get_msmember', error);
          this.usrsrv.toastErr("読込エラー", "ブラウザを再起動しても直らなければ、連絡を！");
          this.form.reset();
          history.replaceState('', '', './mstmember');
          this.overlayRef.detach();
        });
    }
  }

  getRows(fldnm: string): number {
    const lines: number = (this.form.get('base').get(fldnm).value + '\n').match(/\n/g).length;
    return lines;
  }


  updKana(event: KeyboardEvent) {
    let val: string = this.usrsrv.convKana((event.target as HTMLInputElement)?.value);
    // console.log(value,val);
    this.form.get('base').get('kana').setValue(val);
  }

  updMail(fldnm: string, event: KeyboardEvent) {
    let val: string = this.usrsrv.convHan((event.target as HTMLInputElement)?.value);
    // console.log(value,val);
    this.form.get('base').get(fldnm).setValue(val);
  }
  test(value) {
    this.usrsrv.toastInf('機能作成中');
    const invalid = [];
    const ctrls = this.form.controls;
    for (const name in ctrls) {
      if (ctrls[name].invalid) {
        invalid.push(name, ctrls[name]);
      }
    }
    // console.log(this.form.controls,(this.form.controls['addr0'] as FormGroup).controls);  
    const ctrls0 = (this.form.controls['base'] as FormGroup).controls;
    for (const name in ctrls0) {
      if (ctrls0[name].invalid) {
        // invalid.push(name + '_' + ctrls0[name].invalid);
        console.log('base', name);
      }
    }
    const ctrls1 = (this.form.controls['addr0'] as FormGroup).controls;
    for (const name in ctrls1) {
      if (ctrls1[name].invalid) {
        // invalid.push(name + '_' + ctrls1[name].invalid);
        console.log('addr0', name);
      }
    }
    const ctrls2 = (this.form.controls['addr1'] as FormGroup).controls;
    for (const name in ctrls2) {
      if (ctrls2[name].invalid) {
        // invalid.push(name + '_' + ctrls1[name].invalid);
        console.log('addr1', name);
      }
    }


    console.log(this.form.invalid, invalid);
  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.form.enable();
    this.mcd = "";
  }

  modeToUpd(): void {
    if (this.checkMcode(this.mcd)) {
      this.mode = 2;
      this.form.enable();
      history.replaceState('', '', './mstmember/' + this.mode + '/' + this.mcd);
    }
  }

  modeToDel(flg, mode): void {
    let lctxt: string = (flg ? '削除' : '削除取消');
    if (window.confirm(lctxt + 'してもよろしいですか？')) {

      this.apollo.mutate<any>({
        mutation: Query.DeleteMast,
        variables: {
          id: this.usrsrv.compid,
          mcd: this.mcd,
          flg: flg,
          uat: new Date(),
          uby: this.usrsrv.staff.code
        },
        refetchQueries: [
          {
            query: Query.GetMast1,
            variables: {
              id: this.usrsrv.compid,
              mcd: this.mcd
            },
          }],
      }).subscribe(({ data }) => {
        this.usrsrv.toastSuc('顧客コード' + this.mcd + 'を' + lctxt + 'しました');
      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '顧客コード' + this.mcd + 'の' + lctxt + 'ができませんでした');
        console.log('error del_jyuen', error);
      });
      this.mode = mode;
      this.form.disable();
      history.replaceState('', '', './mstmember/' + this.mode + '/' + this.mcd);
    }
  }

  cancel(): void {
    if (this.mode == 1) {
      this.mcd = "";
      this.form.reset();
    }
    this.mode = 3;
    this.form.disable();
    this.form.markAsPristine();
    history.replaceState('', '', './mstmember/' + this.mode + '/' + this.mcd);
  }

  async getMcode() {
    if (!this.mcd) {
      return await this.usrsrv.getNumber('mcode', 1).toString();
    } else {
      return this.mcd;
    }
  }

  async save() {
    // console.log(this.form.get('base'), this.form.get('base').value);
    let member: any = {
      id: this.usrsrv.compid,
      mcode: this.mcd,
      sei: this.usrsrv.editFrmval(this.form.get('base'), 'sei'),
      mei: this.usrsrv.editFrmval(this.form.get('base'), 'mei'),
      kana: this.usrsrv.editFrmval(this.form.get('base'), 'kana'),
      tankakbn: this.usrsrv.editFrmval(this.form.get('base'), 'tankakbn'),
      mail: this.usrsrv.editFrmval(this.form.get('base'), 'mail'),
      mail2: this.usrsrv.editFrmval(this.form.get('base'), 'mail2'),
      mail3: this.usrsrv.editFrmval(this.form.get('base'), 'mail3'),
      mail4: this.usrsrv.editFrmval(this.form.get('base'), 'mail4'),
      mail5: this.usrsrv.editFrmval(this.form.get('base'), 'mail5'),
      torikbn: Boolean(this.form.get('base').value.torikbn),
      sime: this.usrsrv.editFrmval(this.form.get('base'), 'sime'),
      site: this.usrsrv.editFrmval(this.form.get('base'), 'site'),
      inday: this.usrsrv.editFrmval(this.form.get('base'), 'inday'),
      scde: this.usrsrv.editFrmval(this.form.get('base'), 'scde'),
      memo: this.usrsrv.editFrmval(this.form.get('base'), 'memo'),
      dmemo: this.usrsrv.editFrmval(this.form.get('base'), 'dmemo'),
      pcode: this.usrsrv.editFrmval(this.form.get('base'), 'pcode'),
      hcode: this.usrsrv.editFrmval(this.form.get('base'), 'hcode'),
      htime: this.usrsrv.editFrmval(this.form.get('base'), 'htime'),
      jcode: this.usrsrv.editFrmval(this.form.get('base'), 'jcode'),
      mtax: this.usrsrv.editFrmval(this.form.get('base'), 'mtax'),
      sscode: this.usrsrv.editFrmval(this.form.get('base'), 'sscode'),
      daibunrui: this.usrsrv.editFrmval(this.form.get('base'), 'daibunrui'),
      chubunrui: this.usrsrv.editFrmval(this.form.get('base'), 'chubunrui'),
      shobunrui: this.usrsrv.editFrmval(this.form.get('base'), 'shobunrui'),
      tcode1: this.usrsrv.editFrmval(this.form.get('base'), 'tcode1'),
      tcode: this.usrsrv.editFrmval(this.form.get('base'), 'tcode'),
      del: Boolean(this.form.get('base').value.del),
      sptnkbn: this.usrsrv.editFrmval(this.form.get('base'), 'sptnkbn'),
      ntype: this.usrsrv.editFrmval(this.form.get('base'), 'ntype'),
      tntype: this.usrsrv.editFrmval(this.form.get('base'), 'tntype'),
      webid: this.usrsrv.editFrmval(this.form.get('base'), 'webid'),
      ryoate: this.usrsrv.editFrmval(this.form.get('base'), 'ryoate'),
      mtgt1: this.form.get('base').value.mtgt1,
      mtgt2: this.form.get('base').value.mtgt2,
      mtgt3: this.form.get('base').value.mtgt3,
      mtgt4: this.form.get('base').value.mtgt4,
      mtgt5: this.form.get('base').value.mtgt5,
      jan: this.usrsrv.editFrmval(this.form.get('base'), 'jan'),
      gadr: this.usrsrv.editFrmval(this.form.get('base'), 'gadr'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code
    }
    console.log(member);
    if (this.mode == 2) {
      this.apollo.mutate<any>({
        mutation: Query.UpdateMast1,
        variables: {
          id: this.usrsrv.compid,
          mcd: this.mcd,
          "_set": member
        },
      }).subscribe(({ data }) => {
        // console.log('update_msmember', data);
        this.form.get('addr0').patchValue({ dmemo: member.dmemo, memo: member.memo });
        this.children.toArray()[0].saveMadr(this.mcd, 0, this.mode);
        // console.log(this.form.get('addr1').value);
        if (this.form.get('addr1').value.zip != null) {
          this.children.toArray()[1].saveMadr(this.mcd, 1, this.flgadr1);
        }
        this.usrsrv.toastSuc('顧客コード' + this.mcd + 'の変更を保存しました');
        this.mode = 3;
        this.form.disable();
        this.form.markAsPristine();
      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '顧客コード' + this.mcd + 'の変更保存ができませんでした');
        console.log('error update_msmember', error);
      });
    } else {//新規登録
      let membs: any[] = [];
      // this.usrsrv.getNumber('mcode',1)
      //   .subscribe(value => {
      this.mcd = await this.getMcode();
      member.mcode = this.mcd;
      if (!member.sscode) {
        member.sscode = this.mcd;
      }
      if (!member.scde) {
        member.scde = this.mcd;
      }
      member.created_at = new Date();
      member.created_by = this.usrsrv.staff.code;
      membs.push(member);
      this.apollo.mutate<any>({
        mutation: Query.InsertMast1,
        variables: {
          "object": membs
        },
      }).subscribe(({ data }) => {
        console.log('Insert_msmember', data);
        this.children.toArray()[0].saveMadr(this.mcd, 0, this.mode);
        // console.log(this.form.get('addr1').get('zip'),);
        if (this.form.get('addr1').value.zip != null) {
          this.children.toArray()[1].saveMadr(this.mcd, 1, this.flgadr1);
        }

        this.usrsrv.toastSuc('顧客コード' + this.mcd + 'を新規登録しました');
        this.mode = 3;
        this.form.disable();
        this.form.markAsPristine();
        history.replaceState('', '', './mstmember/' + this.mode + '/' + this.mcd);
      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '顧客コード' + this.mcd + 'の新規登録ができませんでした');
        console.log('error Insert_msmember', error);
      });
      // },(error) => {
      //   this.toastr.error('データベースエラー','顧客コードの新規採番ができませんでした',
      //                     {closeButton: true,disableTimeOut: true,tapToDismiss: false});
      //   console.log('error query get_maxmcode', error);
      // });          
    }
  }

  shouldConfirmOnBeforeunload(): boolean {
    return this.form.dirty;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }

  getInvalid(): string {
    let tooltip: string = "";
    const ctrls0 = (this.form.controls['base'] as FormGroup).controls;
    for (const name in ctrls0) {
      if (ctrls0[name].invalid) {
        // invalid.push(name + '_' + ctrls0[name].invalid);
        tooltip += this.usrsrv.getColtxt('msmember', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';

        // console.log(name,ctrls0[name].errors);
      }
    }
    const ctrls1 = (this.form.controls['addr0'] as FormGroup).controls;
    for (const name in ctrls1) {
      if (ctrls1[name].invalid) {
        tooltip += this.usrsrv.getColtxt('msmadr', name) + '⇒' + this.usrsrv.getValiderr(ctrls1[name].errors) + '\n';
        // invalid.push(name + '_' + ctrls1[name].invalid);
        // console.log('addr0',name);
      }
    }
    const ctrls2 = (this.form.controls['addr1'] as FormGroup).controls;
    for (const name in ctrls2) {
      if (ctrls2[name].invalid) {
        tooltip += this.usrsrv.getColtxt('msmadr', name) + '⇒' + this.usrsrv.getValiderr(ctrls2[name].errors) + '\n';
        // invalid.push(name + '_' + ctrls1[name].invalid);
        // console.log('addr1',name);
      }
    }
    console.log(tooltip);
    return tooltip;

  }
}