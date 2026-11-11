import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, ChangeDetectionStrategy, ChangeDetectorRef, viewChild, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { SdnohelpComponent } from './../share/sdnohelp/sdnohelp.component';
import { HdnohelpComponent } from './../share/hdnohelp/hdnohelp.component';
import { SimeitblComponent } from './simeitbl.component';
import { BeforeunloadBase } from '../beforeunload-base';
import { filter } from 'rxjs/operators';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../mstvendor/vends.service';
import { SiimeiService, SiidenSet, SiidenNew, SiimeiInput, SiiZaiko, EXTYPE_SIIRE } from './siimei.service';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { HatmeiService } from './../frmsupply/hatmei.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatInput, MatSuffix, MatFormField, MatLabel } from '@angular/material/input';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { TmstmpComponent } from '../core/tmstmp/tmstmp.component';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatSelect, MatOption } from '@angular/material/select';
import { DecimalPipe } from '@angular/common';
import { JdatePipe } from '../core/pipes/jdate.pipe';
import { VcdtxtPipe } from '../core/pipes/vcdtxt.pipe';
import { ModetxtPipe } from '../core/pipes/modetxt.pipe';

/** 仕入入力フォーム の項目名（明細の mtbl は除く） */
type SiireField = 'vcode' | 'inday' | 'scode' | 'tcode' | 'currency' | 'dmemo' | 'gtotal' | 'tax' | 'total';

@Component({
    selector: 'app-frmsiire',
    templateUrl: './frmsiire.component.html',
    styleUrls: ['./../app.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [RouterLink, MatToolbar, MatButton, MatIcon, MatTooltip, MatInput, FormsModule, MatIconButton, MatSuffix, ReactiveFormsModule, MatCard, MatCardHeader, MatCardTitle, MatFormField, MatLabel, TmstmpComponent, MatCardContent, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, MatSelect, MatOption, SimeitblComponent, DecimalPipe, JdatePipe, VcdtxtPipe, ModetxtPipe]
})
export class FrmsiireComponent extends BeforeunloadBase implements OnInit, AfterViewInit {
  usrsrv = inject(UserService);
  private fb = inject(FormBuilder);
  private title = inject(Title);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private elementRef = inject(ElementRef);
  private dialog = inject(MatDialog);
  private apollo = inject(Apollo);
  strsrv = inject(StoreService);
  stfsrv = inject(StaffService);
  hmisrv = inject(HatmeiService);
  smisrv = inject(SiimeiService);
  private vensrv = inject(VendsService);
  private overlay = inject(Overlay);
  private cdRef = inject(ChangeDetectorRef);

  readonly simeitbl = viewChild.required(SimeitblComponent);
  form!: FormGroup;
  /** フォームの項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
  private get ctl(): Record<SiireField, AbstractControl> {
    return this.form.controls as Record<SiireField, AbstractControl>;
  }
  denno: number = 0;
  hdenno: number = 0;
  /** 読み込んだときの入荷数の取り消し分（在庫 trzaiko.hnyu）と、結び付いていた発注伝票 */
  private oldHnyu: SiiZaiko[] = [];
  private oldHdennos: number[] = [];
  mode: number = 3;
  rows: FormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor() {
    super();
    const title = this.title;

    title.setTitle('仕入伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      vcode: new FormControl('', Validators.required),
      inday: new FormControl('', Validators.required),
      scode: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      currency: new FormControl(''),
      dmemo: new FormControl(''),
      gtotal: new FormControl(''),
      tax: new FormControl(''),
      total: new FormControl(''),
      mtbl: this.rows
    });
    this.strsrv.getStore();
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.vensrv.getVendors().then(result => {
      this.route.paramMap.subscribe((params: ParamMap) => {
        if (params.get('mode') === null) {
          this.cancel();
        } else if (Number(params.get('mode')) == 1) {
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
          this.denno = Number(params.get('denno'));
          this.ctl.tcode.setValue(this.usrsrv.staff?.code);
        } else {
          this.mode = Number(params.get('mode'));
          if (params.get('denno') !== null) {
            this.denno = Number(params.get('denno'));
            this.getSiiden(this.denno);
          }
          this.refresh();
        }
      });
    });
    this.smisrv.observe.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }
  getSiiden(denno: number): void {
    if (denno > 0) {
      if (!this.overlayRef.hasAttached()) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.smisrv.qrySiiden(denno).subscribe(
        result => {
          this.form.reset();
          this.oldHnyu = [];
          this.oldHdennos = [];
          if (result == null) {
            this.usrsrv.toastWar("仕入伝票番号" + denno + "は登録されていません");
            history.replaceState('', '', './frmsiire');
          } else {
            let siiden: mwI.Trsiiden = result;
            this.form.patchValue(siiden);
            this.usrsrv.setTmstmp(siiden);
            this.smisrv.siimei = siiden.trsiimeis;
            this.simeitbl().setSiimei();
            // 読み込んだときの入荷数（変更の保存で在庫から引いてから、今の数を足す）と、結び付いた発注伝票
            this.oldHnyu = this.smisrv.hnyuOf(siiden.scode, siiden.inday as unknown as string, siiden.trsiimeis, -1);
            this.oldHdennos = siiden.trsiimeis.map(m => Number(m.hdenno)).filter(n => n > 0);
            this.denno = denno;
            history.replaceState('', '', './frmsiire/' + this.mode + '/' + this.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query Getsiiden', error);
          this.usrsrv.toastInf("仕入伝票番号" + denno + "は登録されていません");
          // this.form.reset();
          // history.replaceState('', '', './frmsupply');
          this.overlayRef.detach();
        }
      );
    }
    this.cdRef.detectChanges();
  }

  getHatden(denno: number): void {
    if (denno > 0) {
      if (!this.overlayRef.hasAttached()) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.hmisrv.qryHatden(denno).subscribe(
        result => {
          this.form.reset();
          if (result == null) {
            this.usrsrv.toastWar("発注伝票番号" + denno + "は登録されていません");
            // history.replaceState('', '', './frmsupply');
          } else {
            let hatden: mwI.Trhatden = result;
            this.form.patchValue(hatden);
            // 入荷日は今日、担当者は自分、備考は参照した発注伝票
            this.form.patchValue({ inday: new Date(), tcode: this.usrsrv.staff?.code, dmemo: '発注伝票' + denno + 'から' });
            // this.usrsrv.setTmstmp(hatden);
            this.smisrv.convHatmei(denno, hatden.vhatzns);
            this.simeitbl().setSiimei();
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


  /** 仕入伝票の操作ログ（登録・変更）を表示する */
  opelog() {
    if (!this.denno) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_SIIRE, keycode: String(this.denno), title: '仕入伝票 ' + this.denno, table: 'trsiiden' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data: data });
  }

  /** 保存のあと、発注明細の入荷済の印と発注伝票の状況を直す（失敗しても仕入伝票は保存済み） */
  private async afterSave(siimei: SiimeiInput[], inday: string | null) {
    try {
      const hd = [...this.oldHdennos, ...siimei.map(m => Number(m.hdenno)).filter(n => n > 0)];
      await this.smisrv.refreshHatden(hd, inday ?? this.usrsrv.formatDate(new Date()), m => this.hmisrv.getHdsta(m));
    } catch (e) {
      console.log('error refreshHatden', e);
      this.usrsrv.toastWar('仕入伝票は保存しましたが、発注伝票の状況を直せませんでした');
    }
  }
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }
  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.getSiiden(this.denno);
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
          this.getSiiden(this.denno);
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
          this.getHatden(this.hdenno);
        }
      }
    );
  }
  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.ctl.tcode.setValue(this.usrsrv.staff?.code);
    this.ctl.inday.setValue(new Date());
    this.ctl.scode.setValue(this.usrsrv.staff.scode);
    this.simeitbl().frmArr.clear();
    this.simeitbl().addRows(1);
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
      this.getSiiden(this.denno);
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmsiire/' + this.mode + '/' + this.denno);
    }
  }
  async save() {

    let siiden: SiidenSet = {
      // id: this.usrsrv.compid,
      // denno: this.denno,
      vcode: this.usrsrv.editFrmval(this.form, 'vcode'),
      inday: this.usrsrv.editFrmday(this.form, 'inday'),
      scode: this.usrsrv.editFrmval(this.form, 'scode'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      dmemo: this.usrsrv.editFrmval(this.form, 'dmemo'),
      gtotal: this.usrsrv.editFrmval(this.form, 'gtotal'),
      // ttotal: this.usrsrv.editFrmval(this.form,'ttotal'),
      tax: this.usrsrv.editFrmval(this.form, 'tax'),
      total: this.usrsrv.editFrmval(this.form, 'total'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code,
      currency: this.usrsrv.editFrmval(this.form, 'currency')
    }

    if (this.mode == 2) {
      let siimei = this.simeitbl().getSiimei(this.denno);
      // 在庫の入荷数: 読み込んだときの分を引き、今の倉庫・入荷日・数量で足す
      const zaiko = [...this.oldHnyu, ...this.smisrv.hnyuOf(siiden.scode, siiden.inday, siimei)];
      this.smisrv.updSiiden(this.denno, siiden, siimei, zaiko)
        .then(async result => {
          await this.afterSave(siimei, siiden.inday);
          this.usrsrv.toastSuc('仕入伝票' + this.denno + 'の変更を保存しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '仕入伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_siiden', error);
        });
    } else {//新規登録
      this.denno = await this.usrsrv.getNumber('sdenno', 1, this.denno);
      const siimei = this.simeitbl().getSiimei(this.denno);
      const trsiiden: SiidenNew[] = [{
        ...{
          id: this.usrsrv.compid,
          denno: this.denno,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code,
          // 送料・手数料（空を許さない列。この画面に欄が無いので 0）
          soryo: 0,
          tesuu: 0
        }
        , ...siiden,
      } as SiidenNew]
      this.smisrv.insSiiden(trsiiden, siimei, this.smisrv.hnyuOf(siiden.scode, siiden.inday, siimei))
        .then(async result => {
          await this.afterSave(siimei, siiden.inday);
          this.usrsrv.toastSuc('仕入伝票' + this.denno + 'を新規登録しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '仕入伝票の新規登録ができませんでした');
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

}
