import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';
import { GrpcdhelpComponent } from './../grpcdhelp/grpcdhelp.component';
import { MsprcprtComponent } from './../msprcprt/msprcprt.component';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatFormField, MatInput, MatPrefix, MatSuffix } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { NuminputDirective } from '../../core/directives/numinput.directive';
import { rowCtl } from '../../core/form-helpers';
import { BeforeunloadBase } from '../../beforeunload-base';

/** 加工工程の 1 行（フォームの値）。項目の型は入力に応じて文字列・数値・未入力(null) */
type MsprocValue = string | number | null;
type MsprocRow = Record<'prcname' | 'prcbody' | 'vcode' | 'code' | 'memo' | 'tanka' | 'genka' | 'posi01' | 'posi02', MsprocValue>;
/** 明細の 1 行のフォーム項目名 */
type RowField = 'prcno' | 'prcname' | 'prcbody' | 'vcode' | 'code' | 'memo' | 'tanka' | 'genka' | 'posi01' | 'posi02';

@Component({
    selector: 'app-msproc',
    templateUrl: './msproc.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatButton, MatIcon, MatDialogTitle, CdkScrollable, MatDialogContent, FormsModule, ReactiveFormsModule, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatIconButton, MatCellDef, MatCell, MatFormField, MatInput, MatPrefix, MatSelect, MatOption, MatSuffix, NuminputDirective, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatDialogActions]
})
export class MsprocComponent extends BeforeunloadBase implements OnInit {
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
    super();
    const data = inject(MAT_DIALOG_DATA);

    this.mcode = data.mcode;
  }

  ngOnInit(): void {
    this.form = this.fb.group({ mtbl: this.fb.array([]) });
    // this.ins_row(1);
  }

  vcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          rowCtl<RowField>(this.frmArr.controls[i]).vcode.setValue(data.code);
          // this.vcdtxt = data.adrname;
        }
      }
    );
  }

  grpcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.autoFocus = true;
    dialogConfig.data = {
      code: this.frmArr.controls[i].value.code
    };
    // console.log(dialogConfig.data);
    let dialogRef = this.dialog.open(GrpcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          rowCtl<RowField>(this.frmArr.controls[i]).code.setValue(data.code);
        }
      }
    );
  }

  prcprtHelp(i: number, fld: RowField): void {
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
          rowCtl<RowField>(this.frmArr.controls[i])[fld].setValue(data.patno);
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
}
