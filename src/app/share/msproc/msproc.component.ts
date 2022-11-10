import { Component, Inject, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
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

@Component({
  selector: 'app-msproc',
  templateUrl: './msproc.component.html',
  styleUrls: ['./msproc.component.scss']
})
export class MsprocComponent implements OnInit {
  mcode: number;
  mode: number = 2;
  form: FormGroup;
  dataSource = new MatTableDataSource();
  displayedColumns = ['patno', 'ptname', 'prctype', 'vcode', 'code', 'memo', 'tanka', 'genka', 'posi01', 'posi02'];

  constructor(private fb: FormBuilder,
    private dialog: MatDialog,
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) data,
    private dialogRef: MatDialogRef<MsprocComponent>) {
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
          this.frmArr.controls[i].get('vcode').setValue(data.code);
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
          this.frmArr.controls[i].get('code').setValue(data.code);
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
          this.frmArr.controls[i].get(fld).setValue(data.patno);
        }
      }
    );
  }

  del_row(row: number) {
    this.frmArr.removeAt(row);
    this.refresh();
  }

  ins_row(row: number) {
    this.frmArr.insert(row, this.createRow(row));
    this.refresh();
  }

  copy_row(row: number) {
    this.frmArr.insert(row, this.createRow(row, this.frmArr.controls[row - 1].value));
    this.refresh();
  }

  createRow(row: number, proc?) {
    return this.fb.group({
      patno: [{ value: row, disabled: true }],
      ptname: [proc?.ptname],
      prctype: [proc?.prctype],
      vcode: [proc?.vcode],
      code: [proc?.code],
      memo: [proc?.memo],
      tanka: [proc?.tanka],
      genka: [proc?.genka]

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
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }
}
