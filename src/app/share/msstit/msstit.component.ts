import { Component, Inject, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { UserService } from './../../services/user.service';
import { GcdhelpComponent } from './../gcdhelp/gcdhelp.component';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

@Component({
  selector: 'app-msstit',
  templateUrl: './msstit.component.html',
  styleUrls: ['./msstit.component.scss']
})
export class MsstitComponent implements OnInit {
  mcode: number;
  mode: number = 2;
  form: FormGroup;
  dataSource = new MatTableDataSource();
  displayedColumns = ['line', 'patno'];
  constructor(private fb: FormBuilder,
    public usrsrv: UserService,
    public cdRef: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) data,
    private dialogRef: MatDialogRef<MsstitComponent>) {
    this.mcode = data.mcode;
  }

  ngOnInit(): void {
    this.form = this.fb.group({ mtbl: this.fb.array([]) });
    this.ins_row(1);
  }
  async newPno(i: number) {
    let lcpno: number = await this.usrsrv.getNumber('patno', 1,);
    this.frmArr.controls[i].patchValue({ patno: lcpno });
    this.refresh();
  }
  copyPno(i: number) {
    if (i > 0) {
      this.frmArr.controls[i].patchValue({ patno: this.frmArr.getRawValue()[i - 1]['patno'] });
    }
    this.refresh();
  }
  del_row(row: number) {
    this.frmArr.removeAt(row);
    this.refresh();
  }
  ins_row(row: number) {
    this.frmArr.insert(row, this.fb.group({
      line: [{ value: 0, disabled: true }],
      patno: [{ value: null, disabled: true }]
    }));
    this.refresh();
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
