import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';
import { GrpcdhelpComponent } from './../grpcdhelp/grpcdhelp.component';
import { MsprcprtComponent } from './../msprcprt/msprcprt.component';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

/** 加工工程の 1 行（フォームの値）。項目の型は入力に応じて文字列・数値・未入力(null) */
type MsprocValue = string | number | null;
type MsprocRow = Record<'prcname' | 'prcbody' | 'vcode' | 'code' | 'memo' | 'tanka' | 'genka' | 'posi01' | 'posi02', MsprocValue>;
@Component({
    selector: 'app-msproc',
    templateUrl: './msproc.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    }
})
export class MsprocComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  cdRef = inject(ChangeDetectorRef);
  private dialogRef = inject<MatDialogRef<MsprocComponent>>(MatDialogRef);

  mcode: number;
  mode: number = 2;
  form!: FormGroup;
  dataSource = new MatTableDataSource();
  displayedColumns = ['prcno', 'prcname', 'prcbody', 'vcode', 'code', 'memo', 'tanka', 'genka', 'posi01', 'posi02'];

  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    this.mcode = data.mcode;
  }

  ngOnInit(): void {
    this.form = this.fb.group({ mtbl: this.fb.array([]) });
    // this.ins_row(1);
  }

  vcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.frmArr.controls[i].get('vcode')!.setValue(data.code);
          // this.vcdtxt = data.adrname;
        }
      }
    );
  }

  grpcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    dialogConfig.data = {
      code: this.frmArr.controls[i].value.code
    };
    // console.log(dialogConfig.data);
    let dialogRef = this.dialog.open(GrpcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.frmArr.controls[i].get('code')!.setValue(data.code);
        }
      }
    );
  }

  prcprtHelp(i: number, fld: string): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    dialogConfig.data = {
      code: this.frmArr.controls[i].value.code
    };
    // console.log(dialogConfig.data);
    let dialogRef = this.dialog.open(MsprcprtComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.frmArr.controls[i].get(fld)!.setValue(data.patno);
        }
      }
    );
  }

  delRow(row: number) {
    this.frmArr.removeAt(row);
    this.refresh();
  }

  insRow(row: number) {
    this.frmArr.insert(row, this.createRow(row));
    this.refresh();
  }

  copyRow(row: number) {
    this.frmArr.insert(row, this.createRow(row, this.frmArr.controls[row - 1].value));
    this.refresh();
  }

  createRow(row: number, proc?: MsprocRow) {
    return this.fb.group({
      prcno: [{ value: row, disabled: true }],
      prcname: [proc?.prcname],
      prcbody: [proc?.prcbody],
      vcode: [proc?.vcode],
      code: [proc?.code],
      memo: [proc?.memo],
      tanka: [proc?.tanka],
      genka: [proc?.genka],
      posi01: [proc?.posi01],
      posi02: [proc?.posi02]

    });
  }
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }
  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
  }
  cancel(): void {
    this.mode = 3;
    this.form.markAsPristine();
    this.refresh();
  }
  refresh(): void {
    this.dataSource.data = this.frmArr.controls;
    if (this.mode == 3) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    this.cdRef.detectChanges();
  }
  save(): void {
    this.mode = 3;
    this.form.disable();
    this.form.markAsPristine();
  }
  close() {
    this.dialogRef.close();
  }
  shouldConfirmOnBeforeunload(): boolean {
    return this.form.dirty;
  }
  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }
}
