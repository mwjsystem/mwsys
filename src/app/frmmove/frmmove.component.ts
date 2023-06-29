import { Component, OnInit, HostListener, ViewChild, ChangeDetectorRef } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, UntypedFormControl, UntypedFormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";

import { Zaiko, Movsub, MovingService } from './moving.service';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { OkuriService } from './../services/okuri.service';
import { AdredaComponent } from './../share/adreda/adreda.component';
import { MdnohelpComponent } from './../share/mdnohelp/mdnohelp.component';
import { MovtblComponent } from './movtbl.component';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-frmmove',
  templateUrl: './frmmove.component.html',
  styleUrls: ['./../app.component.scss']
})
export class FrmmoveComponent implements OnInit {
  @ViewChild(MovtblComponent) movtbl: MovtblComponent;
  form: UntypedFormGroup;
  denno: number = 0;
  mode: number = 3;
  hktval: mwI.Sval[] = [];
  rows: UntypedFormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(public usrsrv: UserService,
    public stfsrv: StaffService,
    public okrsrv: OkuriService,
    public strsrv: StoreService,
    public movsrv: MovingService,
    private fb: UntypedFormBuilder,
    private dialog: MatDialog,
    private overlay: Overlay,
    private cdRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private title: Title) {
    title.setTitle('移動伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      day: new UntypedFormControl('', Validators.required),
      incode: new UntypedFormControl('', Validators.required),
      outcode: new UntypedFormControl('', Validators.required),
      tcode: new UntypedFormControl('', Validators.required),
      hcode: new UntypedFormControl(),
      hday: new UntypedFormControl(),
      htime: new UntypedFormControl(),
      okurisuu: new UntypedFormControl(),
      okurino: new UntypedFormControl(),
      bikou: new UntypedFormControl(),
      sbikou: new UntypedFormControl(),
      obikou: new UntypedFormControl(),
      mtbl: this.rows
    });
    this.okrsrv.getHaisou();
    this.okrsrv.getHokuri();
    this.okrsrv.getHktime();
    this.strsrv.getStore();
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.route.paramMap.subscribe((params: ParamMap) => {
      if (params.get('mode') === null) {
        this.cancel();
      } else if (+params.get('mode') == 1) {
        this.modeToCre();
        this.route.queryParamMap.pipe(
          filter(n => Object.keys(n["params"]).length !== 0)
        ).subscribe(
          n => {
            let params = n["params"];
            Object.keys(params).map(k => {
              if (k == "stkey") {
                const stra = JSON.parse(localStorage.getItem(params[k]));
                this.form.patchValue({ incode: stra.incode, outcode: stra.outcode });
                this.movtbl.insRows(stra.mei, true);
                localStorage.removeItem(params[k]);
              }
            })
          }
        )
        this.denno = +params.get('denno');
        this.form.get('tcode').setValue(this.usrsrv.staff?.code);
      } else {
        this.mode = +params.get('mode');
        if (params.get('denno') !== null) {
          this.denno = +params.get('denno');
          // console.log(this.denno);
          this.getMovden(this.denno);
        }
        this.refresh();
      }
    });

    this.movsrv.observe.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }

  getMovden(denno: number): void {
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    };
    if (denno > 0) {
      this.movsrv.qryMovden(denno).subscribe(
        result => {
          this.form.reset();
          if (result == null) {
            this.usrsrv.toastWar("移動伝票番号" + denno + "は登録されていません");
            history.replaceState('', '', './frmmove');
          } else {
            // console.log(result);
            let movsub: Movsub = result;
            this.form.patchValue(movsub);
            this.usrsrv.setTmstmp(movsub);
            this.movtbl.setMovmei(movsub.trmovdens);
            // this.form.patchValue({mtax:this.vensrv.get_vendor(this.form.getRawValue()['vcode'])?.mtax});
            this.denno = denno;
            history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query GetHatden', error);
          this.usrsrv.toastWar("移動伝票番号" + denno + "は登録されていません");
          this.form.reset();
          history.replaceState('', '', './frmmove');
          this.overlayRef.detach();
        }
      );
    }
    this.cdRef.detectChanges();
  }
  get frmArr(): UntypedFormArray {
    return this.form.get('mtbl') as UntypedFormArray;
  }

  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.getMovden(this.denno);
  }

  openOkuri(hcode, value) {
    window.open(this.okrsrv.getUrl(hcode) + value, '_blank');
  }

  async setOkrno() {
    let okrno: string = await this.okrsrv.setOkurino(this.form.value.hcode);
    this.form.get('okurino').setValue(okrno);
  }

  selHcd(event: KeyboardEvent) {
    let value: string = (event.target as HTMLInputElement)?.value;
    const i: number = this.okrsrv.hokuri.findIndex(obj => obj.code == value);
    if (i > -1) {
      this.hktval = [];
      for (let j = 0; j < this.okrsrv.hktime.length; j++) {
        if (this.okrsrv.hktime[j].hscode == this.okrsrv.hokuri[i].hscode) {
          let sval: mwI.Sval = { value: this.okrsrv.hktime[j].code, viewval: this.okrsrv.hktime[j].name };
          this.hktval.push(sval);
        }
      }
    } else {
      this.hktval = [];
    }
  }
  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(MdnohelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.denno = data.denno;
          this.getMovden(this.denno);

        }
      }
    );

  }
  canEnter(e: KeyboardEvent): void {
    let element = e.target as HTMLElement;
    // console.log(element,element.tagName);
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

  async save() {

    let movsub: any = {
      day: this.usrsrv.editFrmday(this.form, 'day'),
      outcode: this.usrsrv.editFrmval(this.form, 'outcode'),
      incode: this.usrsrv.editFrmval(this.form, 'incode'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      hcode: this.usrsrv.editFrmval(this.form, 'hcode'),
      hday: this.usrsrv.editFrmday(this.form, 'hday'),
      htime: this.usrsrv.editFrmval(this.form, 'htime'),
      okurisuu: this.usrsrv.editFrmval(this.form, 'okurisuu'),
      okurino: this.usrsrv.editFrmval(this.form, 'okurino'),
      bikou: this.usrsrv.editFrmval(this.form, 'bikou'),
      obikou: this.usrsrv.editFrmval(this.form, 'obikou'),
      sbikou: this.usrsrv.editFrmval(this.form, 'sbikou'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code,
    }

    if (this.mode == 2) {
      let movmei = this.movtbl.getMovmei(this.denno);
      this.movsrv.updMovden(this.denno, movsub, movmei)
        .then(result => {
          this.usrsrv.toastSuc('移動伝票' + this.denno + 'の変更を保存しました');

          //  zaiko更新処理 (読込時分マイナス)
          this.movtbl.trzaiko.forEach(e => {
            this.movsrv.updZaiko(e);
          });

          //  zaiko更新処理 (通常分プラス)
          movmei.forEach(e => {
            if (e.msgood.gskbn == "0") {
              this.movsrv.updZaiko({
                scode: movsub.incode,
                gcode: e.gcode,
                day: movsub.day,
                movi: e.suu,
                movo: 0
              });
              this.movsrv.updZaiko({
                scode: movsub.outcode,
                gcode: e.gcode,
                day: movsub.day,
                movi: 0,
                movo: e.suu
              });
            } else if (e.msgood.gskbn == "1") {
              e.msgood.msgzais.forEach(zai => {
                this.movsrv.updZaiko({
                  scode: movsub.incode,
                  gcode: zai.zcode,
                  day: movsub.day,
                  movi: e.suu * zai.irisu,
                  movo: 0
                });
                this.movsrv.updZaiko({
                  scode: movsub.outcode,
                  gcode: zai.zcode,
                  day: movsub.day,
                  movi: 0,
                  movo: e.suu * zai.irisu
                });
              });
            }
          });
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '移動伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_movsub', error);
        });
    } else {//新規登録
      this.denno = await this.usrsrv.getNumber('mdenno', 1, this.denno);
      const movmei = this.movtbl.getMovmei(this.denno);
      const trmovsub: Movsub[] = [{
        ...{
          id: this.usrsrv.compid,
          denno: this.denno,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code,
        }
        , ...movsub,
      }]
      this.movsrv.insMovden(trmovsub, movmei)
        .then(result => {
          this.usrsrv.toastSuc('移動伝票' + this.denno + 'を新規登録しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '移動伝票の新規登録ができませんでした');
          console.log('error insert_movden', error);
        });
    }

  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.form.get('tcode').setValue(this.usrsrv.staff?.code);
    this.form.get('day').setValue(new Date());
    this.movtbl.frmArr.clear();
    this.movtbl.addRows(1);
    this.refresh();

  }

  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
    history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode = 3;
      this.form.markAsPristine();
      history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
    }
  }
  getInvalid(): string {
    let tooltip: string = "";
    const ctrls0 = this.form.controls;
    // for (const name in ctrls0) {
    //   if (ctrls0[name].invalid) {
    //     if (name == 'mtbl') {
    //       for (let i = 0; i < this.frmArr.length; i++) {
    //         const ctrls = (this.frmArr.at(i) as FormGroup).controls
    //         for (const nam in ctrls) {
    //           if (ctrls[nam].invalid) {
    //             tooltip += this.usrsrv.getColtxt('trmovden', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
    //           }
    //         }
    //       }

    //     } else {
    //       tooltip += this.usrsrv.getColtxt('trmovsub', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
    //     }
    //   }
    // }
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
