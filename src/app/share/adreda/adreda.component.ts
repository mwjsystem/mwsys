import { Component, OnInit, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { FormGroup, FormBuilder, FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { MembsService } from './../../mstmember/membs.service';
import { EdahelpComponent } from './edahelp.component';
import { AddressComponent } from './../address/address.component';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatSuffix } from '@angular/material/input';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { AddressComponent as AddressComponent_1 } from '../address/address.component';
import { ModetxtPipe } from '../../core/pipes/modetxt.pipe';

@Component({
    selector: 'app-adreda',
    templateUrl: './adreda.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatToolbar, MatButton, MatIcon, MatTooltip, FormsModule, MatIconButton, MatSuffix, MatDialogTitle, CdkScrollable, MatDialogContent, ReactiveFormsModule, AddressComponent_1, MatDialogActions, ModetxtPipe]
})
export class AdredaComponent implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  memsrv = inject(MembsService);
  private dialogRef = inject<MatDialogRef<AdredaComponent>>(MatDialogRef);
  private dialog = inject(MatDialog);
  private cdRef = inject(ChangeDetectorRef);
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  private readonly child = viewChild.required(AddressComponent);
  mode: number = 3;
  form!: FormGroup;
  /** 住所グループ（addr）。AddressComponent が初期化時にフォームへ追加するため、参照は都度 controls から取得する */
  private get addrForm(): FormGroup {
    return this.form.controls['addr'] as FormGroup;
  }
  eda: number | string;
  edaOld!: number;
  flg: boolean; //true⇒枝番をセットボタン表示

  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    this.memsrv.mcode = data.mcode;
    this.eda = data.eda;
    this.flg = data.flg;
  }

  ngOnInit(): void {
    this.form = this.fb.group({});

  }

  ngAfterViewInit(): void {
    let i: number = this.memsrv.adrs.findIndex(obj => obj.eda > 1);

    // console.log(i);
    if (i > -1 && (this.eda == null || this.eda == '')) {
      this.eda = this.memsrv.adrs[i].eda;
    } else if (this.eda == null) {
      this.form.reset();
      // this.cdRef.detectChanges();
    }
    // console.log(this.eda);
    this.refresh();
  }

  close() {
    this.dialogRef.close();
  }

  setEda() {
    if (this.mode == 3) {
      this.dialogRef.close(this.eda);
    } else {
      this.child().saveMadr(this.memsrv.mcode, this.eda, this.mode).subscribe(madr => {
        this.updateAdrs(madr);
        this.eda = madr.eda;
        this.mode = 3;
        this.form.disable();
        this.form.markAsPristine();
        this.dialogRef.close(this.eda);
      });
    }
  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.form.enable();
    this.edaOld = +this.eda;
    this.eda = "新規登録";
    const memos = {
      nmemo: this.memsrv.adrs[0].nmemo,
      smemo: this.memsrv.adrs[0].smemo,
      omemo: this.memsrv.adrs[0].omemo,
      htitle: '0'
    };
    this.addrForm.patchValue(memos);
  }

  modeToUpd(): void {
    this.mode = 2;
    this.form.enable();
  }

  save(): void {
    this.child().saveMadr(this.memsrv.mcode, this.eda, this.mode).subscribe(madr => {
      this.updateAdrs(madr);
      this.eda = madr.eda;
      this.mode = 3;
      this.form.disable();
      this.form.markAsPristine();
    });
  }
  cancel(): void {
    if (this.mode == 1) {
      this.eda = this.edaOld;
    }
    this.mode = 3;
    this.form.disable();
  }
  updateAdrs(padrs: mwI.Adrs) {
    if (this.mode == 1) {
      this.memsrv.adrs.push(padrs);
    } else if (this.mode == 2) {
      const i: number = this.memsrv.adrs.findIndex(obj => obj.eda == padrs.eda);
      if (i > -1) {
        this.memsrv.adrs[i] = padrs;
      }
    }
  }
  setNext() {
    let i: number = this.memsrv.adrs.findIndex(obj => obj.eda == this.eda);
    if (i > -1 && i < this.memsrv.adrs.length - 1) {
      this.eda = this.memsrv.adrs[i + 1].eda;
    }
    this.refresh();
  }

  setPrev() {
    let i: number = this.memsrv.adrs.findIndex(obj => obj.eda == this.eda);
    if (i > 0 && this.memsrv.adrs[i].eda > 10) {
      this.eda = this.memsrv.adrs[i - 1].eda;
    }
    this.refresh();
  }

  refresh(): void {
    let i: number = this.memsrv.adrs.findIndex(obj => obj.eda == this.eda);
    // console.log(i,this.eda);
    if (i > -1) {
      let lcadrs: mwI.Adrs = this.memsrv.adrs[i];
      // console.log(adrs,this.form.get('addr'));
      this.addrForm.patchValue(lcadrs);
    }
    if (this.mode == 3) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    this.cdRef.detectChanges();
  }

  edaHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(EdahelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.eda = data.eda;
        }
        this.refresh();
      }
    );
  }

  onEnter(): void {
    // this.elementRef.nativeElement.querySelector('button').focus();
    this.refresh();
  }

  getInvalid(): string {
    let tooltip: string = "";
    const ctrls = (this.form.controls['addr'] as FormGroup).controls;
    // console.log('addr',ctrls);
    for (const name in ctrls) {
      if (ctrls[name].invalid) {
        // console.log('addr',name);
        tooltip += this.usrsrv.getColtxt('msmadr', name) + '⇒' + this.usrsrv.getValiderr(ctrls[name].errors) + '\n';
        // invalid.push(name + '_' + ctrls1[name].invalid);
      }
    }
    // console.log(tooltip);
    return tooltip;

  }


}