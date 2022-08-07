import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { HdnohelpComponent } from './../share/hdnohelp/hdnohelp.component';
import { HmeitblComponent } from './hmeitbl.component';
// import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../services/vends.service';
import { DownloadService } from './../services/download.service';
import { HatmeiService } from './hatmei.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-frmsupply',
  templateUrl: './frmsupply.component.html',
  styleUrls: ['./../app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FrmsupplyComponent implements OnInit, AfterViewInit {
  @ViewChild(HmeitblComponent) hmeitbl: HmeitblComponent;
  form: FormGroup;
  denno: number = 0;
  mode: number = 3;
  // base64:string;
  // vcdtxt:string;
  rows: FormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(public usrsrv: UserService,
    private fb: FormBuilder,
    private title: Title,
    private route: ActivatedRoute,
    private router: Router,
    private elementRef: ElementRef,
    private dialog: MatDialog,
    public dwlsrv: DownloadService,
    public bunsrv: BunruiService,
    public strsrv: StoreService,
    public stfsrv: StaffService,
    public hmisrv: HatmeiService,
    private vensrv: VendsService,
    // private toastr: ToastrService,
    private overlay: Overlay,
    private cdRef: ChangeDetectorRef) {
    title.setTitle('発注伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      vcode: new FormControl(''),
      day: new FormControl('', Validators.required),
      scode: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      autoproc: new FormControl(''),
      mtax: new FormControl(''),
      currency: new FormControl(''),
      // hdstatus: new FormControl(''),
      dbiko: new FormControl(''),
      inbiko: new FormControl(''),
      gtotal: new FormControl(''),
      // ttotal: new FormControl(''),
      tax: new FormControl(''),
      total: new FormControl(''),
      // jdenno: new FormControl(''),
      mtbl: this.rows
    });

    // this.cdRef.detectChanges(); 

    this.strsrv.get_store();
    this.bunsrv.get_bunrui();
    // this.stfsrv.get_staff();
  }

  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    // console.log(this.usrsrv);
    this.vensrv.get_vendors().then(result => {
      this.route.paramMap.subscribe((params: ParamMap) => {
        if (params.get('mode') === null) {
          this.cancel();
        } else if (+params.get('mode') == 1) {
          this.modeToCre();
          // console.log(params);
          // JSON.parse(localstrage.getItem()); 
          this.route.queryParamMap.pipe(
            filter(n => Object.keys(n["params"]).length !== 0)
          ).subscribe(
            n => {
              let params = n["params"];
              Object.keys(params).map(k => {
                if (k == "stkey") {
                  const stra = JSON.parse(localStorage.getItem(params[k]));
                  this.form.patchValue({ vcode: stra.vcd });
                  this.updVcd(stra.vcd);
                  this.hmeitbl.insRows(stra.mei, true);
                  // console.log(stra.hdno,this.denno);
                  localStorage.removeItem(params[k]);
                }
              })
            }
          )
          this.denno = +params.get('denno');
          this.form.get('tcode').setValue(this.usrsrv.staff?.code);
          this.form.get('autoproc').setValue(true);
        } else {
          this.mode = +params.get('mode');
          if (params.get('denno') !== null) {
            this.denno = +params.get('denno');
            // console.log(this.denno);
            this.get_hatden(this.denno);
          }
          this.refresh();
        }
      });
    });
    this.hmisrv.observe.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }

  get_hatden(denno: number): void {
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    if (denno > 0) {
      this.hmisrv.qry_hatden(denno).subscribe(
        result => {
          this.form.reset();
          if (result == null) {
            this.usrsrv.toastWar("発注伝票番号" + denno + "は登録されていません");
            history.replaceState('', '', './frmsupply');
          } else {
            let hatden: mwI.Trhatden = result;
            this.form.patchValue(hatden);
            this.form.patchValue(hatden.msvendor[0]);
            this.usrsrv.setTmstmp(hatden);
            this.hmisrv.hatmei = hatden.vhatzns;
            this.hmeitbl.set_hatmei();
            // this.form.patchValue({mtax:this.vensrv.get_vendor(this.form.getRawValue()['vcode'])?.mtax});
            this.denno = denno;
            history.replaceState('', '', './frmsupply/' + this.mode + '/' + this.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query GetHatden', error);
          this.usrsrv.toastWar("発注伝票番号" + denno + "は登録されていません");
          this.form.reset();
          history.replaceState('', '', './frmsupply');
          this.overlayRef.detach();
        }
      );
    }
    this.cdRef.detectChanges();
  }
  updVcd(value: string): void {
    this.form.patchValue({ mtax: this.vensrv.get_vendor(value)?.mtax, currency: this.vensrv.get_vendor(value)?.currency });
  }
  test(value) {
    this.usrsrv.toastInf(this.form.value.yday);
    // this.usrsrv.getNumber('denno',2).subscribe(value => {
    //   console.log(value);
    // });
    console.log(this.hmeitbl.get_hatmei(this.denno));
    this.refresh();
    // this.router.navigate(['/mstmember','3',value]);
    // const url = this.router.createUrlTree(['/mstmember','3',value]);
    // window.open(url.toString(),null,'top=100,left=100');
  }

  async download_csv(format: string) {
    let head = this.dwlsrv.pickObj(this.form.getRawValue(), ['day', 'vcode', 'scode', 'biko']);
    // head['tcdnm0'] = this.stfsrv.get_name(this.form.getRawValue().tcode);
    const vend = this.vensrv.get_vendor(this.form.getRawValue().vcode);
    head['adrname'] = vend.name;
    head['tel'] = vend.tel;
    head['fax'] = vend.fax;
    const store = await this.strsrv.get_stradr(this.form.getRawValue().scode);
    head['sname'] = store.name;
    head['szip'] = store.zip;
    head['sregion'] = store.region;
    head['slocal'] = store.local;
    head['sstreet'] = store.street;
    head['sextend'] = store.extend;
    head['stel'] = store.tel;
    head['sfax'] = store.fax;
    const det = this.dwlsrv.pickObjArr(this.form.getRawValue().mtbl, ['line', 'gcode', 'gtext', 'suu', 'unit', 'jdenno', 'mbikou']);
    this.dwlsrv.dl_png('staff/', this.form.getRawValue().tcode.toString() + ".png", this.denno + format + ".png");
    this.dwlsrv.dl_csv(head, this.denno + format + "H.csv");
    this.dwlsrv.dl_csv(det, this.denno + format + "M.csv");
    this.dwlsrv.dl_kick(this.usrsrv.system.urischema + format + "_" + this.denno, this.elementRef);
  }

  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }

  vcdHelp(fldnm: string): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.form.get(fldnm).setValue(data.code);
          // this.vcdtxt = data.adrname;
        }
      }
    );
  }
  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.get_hatden(this.denno);
  }
  canEnter(e: KeyboardEvent): void {
    let element = e.target as HTMLElement;
    if (element.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  }
  refresh(): void {
    // if (this.denno >0 ){
    // }
    if (this.mode == 3) {
      this.form.disable();
      // this.usrsrv.disable_mtbl(this.form);
    } else {
      this.form.enable();
      // this.usrsrv.enable_mtbl(this.form);
    }
    this.cdRef.detectChanges();
  }

  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(HdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.denno = data.denno;
          // console.log(data);
          this.get_hatden(this.denno);
        }
      }
    );
  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.form.get('tcode').setValue(this.usrsrv.staff?.code);
    this.form.get('day').setValue(new Date());
    this.form.get('scode').setValue(this.usrsrv.staff.scode);
    // this.form.get('hdstatus').setValue("0"); 
    this.hmeitbl.frmArr.clear();
    console.log(this.hmeitbl.frmArr);
    this.hmeitbl.add_rows(1);
    this.refresh();
  }

  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
    history.replaceState('', '', './frmsupply/' + this.mode + '/' + this.denno);
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode = 3;
      this.get_hatden(this.denno);
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmsupply/' + this.mode + '/' + this.denno);
    }
  }

  async save() {

    let hatden: any = {
      // id: this.usrsrv.compid,
      // denno: this.denno,
      vcode: this.usrsrv.editFrmval(this.form, 'vcode'),
      day: this.usrsrv.editFrmday(this.form, 'day'),
      scode: this.usrsrv.editFrmval(this.form, 'scode'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      autoproc: this.usrsrv.editFrmval(this.form, 'autoproc'),
      // mtax: this.usrsrv.editFrmval(this.form,'mtax'),
      dbiko: this.usrsrv.editFrmval(this.form, 'dbiko'),
      inbiko: this.usrsrv.editFrmval(this.form, 'inbiko'),
      gtotal: this.usrsrv.editFrmval(this.form, 'gtotal'),
      // ttotal: this.usrsrv.editFrmval(this.form,'ttotal'),
      tax: this.usrsrv.editFrmval(this.form, 'tax'),
      total: this.usrsrv.editFrmval(this.form, 'total'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code,
      currency: this.usrsrv.editFrmval(this.form, 'currency')
    }

    if (this.mode == 2) {
      let hatmei = this.hmeitbl.get_hatmei(this.denno);
      this.hmisrv.upd_hatden(this.denno, hatden, hatmei)
        .then(result => {
          // console.log('update_hatden',result);
          this.usrsrv.toastSuc('発注伝票' + this.denno + 'の変更を保存しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '発注伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_hatden', error);
        });
    } else {//新規登録
      this.denno = await this.usrsrv.getNumber('hdenno', 1, this.denno);
      const hatmei = this.hmeitbl.get_hatmei(this.denno);
      const trhatden: mwI.Trhatden[] = [{
        ...{
          id: this.usrsrv.compid,
          denno: this.denno,
          //  trhatmeis:hatmei,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code,
          hdstatus: this.hmisrv.get_hdsta(hatmei),
        }
        , ...hatden,
      }]
      // console.log(trhatden);
      this.hmisrv.ins_hatden(trhatden, hatmei)
        .then(result => {
          // console.log('insert_trhat',result);
          this.usrsrv.toastSuc('発注伝票' + this.denno + 'を新規登録しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '発注伝票の新規登録ができませんでした');
          console.log('error insert_hatden', error);
        });
    }
  }

  getInvalid(): string {
    let tooltip: string = "";
    const ctrls0 = this.form.controls;
    for (const name in ctrls0) {
      if (ctrls0[name].invalid) {
        if (name == 'mtbl') {
          for (let i = 0; i < this.frmArr.length; i++) {
            const ctrls = (this.frmArr.at(i) as FormGroup).controls
            for (const nam in ctrls) {
              if (ctrls[nam].invalid) {
                tooltip += this.usrsrv.getColtxt('trhatmei', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
              }
            }
          }

        } else {
          tooltip += this.usrsrv.getColtxt('trhatden', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
        }
      }
    }
    return tooltip;
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

}
