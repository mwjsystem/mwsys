import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { SdnohelpComponent } from './../share/sdnohelp/sdnohelp.component';
import { HdnohelpComponent } from './../share/hdnohelp/hdnohelp.component';
import { SimeitblComponent } from './simeitbl.component';
import { filter } from 'rxjs/operators';
// import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../services/vends.service';
import { SiimeiService } from './siimei.service';
import { HatmeiService } from './../frmsupply/hatmei.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Component({
  selector: 'app-frmsiire',
  templateUrl: './frmsiire.component.html',
  styleUrls: ['./frmsiire.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FrmsiireComponent implements OnInit, AfterViewInit {
  @ViewChild(SimeitblComponent) simeitbl: SimeitblComponent;
  form: FormGroup;
  denno: number = 0;
  hdenno: number = 0;
  mode: number = 3;
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
    private apollo: Apollo,
    public bunsrv: BunruiService,
    public strsrv: StoreService,
    public stfsrv: StaffService,
    public hmisrv: HatmeiService,
    public smisrv: SiimeiService,
    private vensrv: VendsService,
    // private toastr: ToastrService,
    private overlay: Overlay,
    private cdRef: ChangeDetectorRef) {
    title.setTitle('仕入伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      vcode: new FormControl('', Validators.required),
      inday: new FormControl('', Validators.required),
      scode: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      currency: new FormControl(''),
      dbiko: new FormControl(''),
      gtotal: new FormControl(''),
      tax: new FormControl(''),
      total: new FormControl(''),
      mtbl: this.rows
    });
    this.strsrv.get_store();
    this.bunsrv.get_bunrui();
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.vensrv.get_vendors().then(result => {
      this.route.paramMap.subscribe((params: ParamMap) => {
        if (params.get('mode') === null) {
          this.cancel();
        } else if (+params.get('mode') == 1) {
          this.modeToCre();
          // this.route.queryParamMap.pipe(
          //   filter(n => Object.keys(n["params"]).length !== 0)
          // ).subscribe(
          //   n => {
          //     let params = n["params"];
          //     Object.keys(params).map(k => {
          //       if (k == "stkey") {
          //         const stra = JSON.parse(localStorage.getItem(params[k]));
          //         // this.hmeitbl.insRows(stra.mei,true);
          //         localStorage.removeItem(params[k]);
          //       }
          //     })
          //   }
          // )
          this.denno = +params.get('denno');
          this.form.get('tcode').setValue(this.usrsrv.staff?.code);
        } else {
          this.mode = +params.get('mode');
          if (params.get('denno') !== null) {
            this.denno = +params.get('denno');
            this.get_siiden(this.denno);
          }
          this.refresh();
        }
      });
    });
    this.smisrv.observe.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }
  get_siiden(denno: number): void {
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    if (denno > 0) {
      this.smisrv.qry_siiden(denno).subscribe(
        result => {
          this.form.reset();
          if (result == null) {
            this.usrsrv.toastWar("発注伝票番号" + denno + "は登録されていません");
            history.replaceState('', '', './frmsupply');
          } else {
            let siiden: mwI.Trsiiden = result;
            this.form.patchValue(siiden);
            // this.form.patchValue(siiden.msvendor[0]);
            this.usrsrv.setTmstmp(siiden);
            this.smisrv.siimei = siiden.trsiimeis;
            this.simeitbl.set_siimei();
            // this.form.patchValue({mtax:this.vensrv.get_vendor(this.form.getRawValue()['vcode'])?.mtax});
            // this.denno = denno;
            // history.replaceState('', '', './frmsupply/' + this.mode + '/' + this.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query Getsiiden', error);
          this.usrsrv.toastInf("発注伝票番号" + denno + "は登録されていません");
          // this.form.reset();
          // history.replaceState('', '', './frmsupply');
          this.overlayRef.detach();
        }
      );
    }
    this.cdRef.detectChanges();
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
            // history.replaceState('', '', './frmsupply');
          } else {
            let hatden: mwI.Trhatden = result;
            // console.log(result);
            this.form.patchValue(hatden);
            this.form.patchValue({ inday: hatden.vhatzns[0].yday });
            // this.usrsrv.setTmstmp(hatden);
            this.smisrv.convHatmei(denno, hatden.vhatzns);
            this.simeitbl.set_siimei();
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query GetHatden', error);
          this.usrsrv.toastInf("発注伝票番号" + denno + "は登録されていません");
          this.form.reset();
          // history.replaceState('', '', './frmsupply');
          this.overlayRef.detach();
        }
      );
    }
    this.cdRef.detectChanges();
  }


  test(value) {
    // this.toastr.info(this.form.value.yday);
    console.log(this.simeitbl.get_siimei(this.denno));
    this.refresh();
    // this.router.navigate(['/mstmember','3',value]);
    // const url = this.router.createUrlTree(['/mstmember','3',value]);
    // window.open(url.toString(),null,'top=100,left=100');
  }
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }
  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.get_siiden(this.denno);
  }
  refresh(): void {
    if (this.mode == 3) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    this.cdRef.detectChanges();
  }
  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(SdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.denno = data.denno;
          this.get_siiden(this.denno);
        }
      }
    );
  }
  hdennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(HdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.hdenno = data.denno;
          // console.log(data);
          this.get_hatden(this.hdenno);
        }
      }
    );
  }
  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.form.get('tcode').setValue(this.usrsrv.staff?.code);
    this.form.get('inday').setValue(new Date());
    this.form.get('scode').setValue(this.usrsrv.staff.scode);
    this.simeitbl.frmArr.clear();
    this.simeitbl.add_rows(1);
    this.refresh();
  }

  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
    history.replaceState('', '', './frmsiire/' + this.mode + '/' + this.denno);
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode = 3;
      this.get_siiden(this.denno);
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmsiire/' + this.mode + '/' + this.denno);
    }
  }
  async save() {

    let siiden: any = {
      // id: this.usrsrv.compid,
      // denno: this.denno,
      vcode: this.usrsrv.editFrmval(this.form, 'vcode'),
      inday: this.usrsrv.editFrmday(this.form, 'inday'),
      scode: this.usrsrv.editFrmval(this.form, 'scode'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      dbiko: this.usrsrv.editFrmval(this.form, 'dbiko'),
      gtotal: this.usrsrv.editFrmval(this.form, 'gtotal'),
      // ttotal: this.usrsrv.editFrmval(this.form,'ttotal'),
      tax: this.usrsrv.editFrmval(this.form, 'tax'),
      total: this.usrsrv.editFrmval(this.form, 'total'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code,
      currency: this.usrsrv.editFrmval(this.form, 'currency')
    }

    if (this.mode == 2) {
      let siimei = this.simeitbl.get_siimei(this.denno);
      this.smisrv.upd_siiden(this.denno, siiden, siimei)
        .then(result => {
          // console.log('update_hatden',result);
          this.usrsrv.toastSuc('仕入伝票' + this.denno + 'の変更を保存しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '仕入伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_siiden', error);
        });
    } else {//新規登録
      this.denno = await this.usrsrv.getNumber('sdenno', 1, this.denno);
      const siimei = this.simeitbl.get_siimei(this.denno);
      const trsiiden: mwI.Trsiiden[] = [{
        ...{
          id: this.usrsrv.compid,
          denno: this.denno,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code
        }
        , ...siiden,
      }]
      // console.log(trhatden);
      this.hmisrv.ins_hatden(trsiiden, siimei)
        .then(result => {
          // console.log('insert_trhat',result);
          this.usrsrv.toastSuc('発注伝票' + this.denno + 'を新規登録しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '発注伝票の新規登録ができませんでした');
          console.log('error insert_siiden', error);
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
                tooltip += this.usrsrv.getColtxt('trsiimei', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
              }
            }
          }

        } else {
          tooltip += this.usrsrv.getColtxt('trsiiden', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
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
