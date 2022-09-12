import { Component, OnInit, HostListener, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Movsub, MovingService } from './moving.service';
import { UserService } from './../services/user.service';
import { EdaService } from './../share/adreda/eda.service';
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
  form: FormGroup;
  denno: number = 0;
  mode: number = 3;
  hktval: mwI.Sval[] = [];
  rows: FormArray = this.fb.array([]);
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
    private fb: FormBuilder,
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
      day: new FormControl('', Validators.required),
      incode: new FormControl('', Validators.required),
      outcode: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      hcode: new FormControl(),
      hday: new FormControl(),
      htime: new FormControl(),
      okurisuu: new FormControl(),
      okurino: new FormControl(),
      bikou: new FormControl(),
      sbikou: new FormControl(),
      obikou: new FormControl(),
      mtbl: this.rows
    });
    this.okrsrv.get_haisou();
    this.okrsrv.get_hokuri();
    this.okrsrv.get_hktime();
    this.strsrv.get_store();
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
          this.get_movden(this.denno);
        }
        this.refresh();
      }
    });

    this.movsrv.observe.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }

  get_movden(denno: number): void {
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    };
    if (denno > 0) {
      this.movsrv.qry_movden(denno).subscribe(
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
            this.movtbl.set_movmei(movsub.trmovdens);
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
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }

  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.get_movden(this.denno);
  }

  openOkuri(hcode, value) {
    window.open(this.okrsrv.get_url(hcode) + value, '_blank');
  }

  async setOkrno() {
    let okrno: string = await this.okrsrv.set_okurino(this.form.value.hcode);
    this.form.get('okurino').setValue(okrno);
  }

  selected(value: number) {
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
          this.get_movden(this.denno);

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

  save() {

  }
  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.form.get('tcode').setValue(this.usrsrv.staff?.code);
    this.form.get('day').setValue(new Date());
    this.movtbl.frmArr.clear();
    this.movtbl.add_rows(1);
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
