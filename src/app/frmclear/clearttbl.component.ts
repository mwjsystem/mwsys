import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, FormControl, Validators, UntypedFormArray, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { ClearService, Seiden, ClearInput } from './clear.service';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatInput, MatPrefix } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { NuminputDirective } from '../core/directives/numinput.directive';
import { rowCtl } from '../core/form-helpers';

/** 明細の 1 行のフォーム項目名 */
type RowField = 'line' | 'ptype' | 'nmoney' | 'smoney' | 'tmoney' | 'total' | 'mmemo';

@Component({
    selector: 'app-clearttbl',
    templateUrl: './clearttbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, ReactiveFormsModule, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatIconButton, MatIcon, MatCellDef, MatCell, MatFormField, MatInput, MatPrefix, MatSelect, MatOption, NuminputDirective, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow]
})
export class ClearttblComponent implements OnInit {
  private cdRef = inject(ChangeDetectorRef);
  private fb = inject(UntypedFormBuilder);
  clrsrv = inject(ClearService);
  bunsrv = inject(BunruiService);
  usrsrv = inject(UserService);

  readonly parentForm = input.required<UntypedFormGroup>();
  dataSource = new MatTableDataSource();
  displayedColumns: string[] = ['line',
    'ptype',
    'nmoney',
    'smoney',
    'tmoney',
    'total',
    'mmemo'];

  ngOnInit(): void {
    this.insRow(0);
    this.clrsrv.observeD.subscribe((nyuden) => {
      this.cdRef.detectChanges();
    });
  }
  get frmArr(): UntypedFormArray {
    return this.parentForm().get('mtbl') as UntypedFormArray;
  }
  delRow(row: number) {
    this.frmArr.removeAt(row);
    this.autoFil();
  }
  insRow(row: number) {
    this.frmArr.insert(row, this.createRow(row));
    this.autoFil();
  }
  calcTot() {
    let lcnmoneysum: number = 0;
    let lcsmoneysum: number = 0;
    let lctmoneysum: number = 0;
    let lctotalmoney: number = 0;
    const arr = this.frmArr.getRawValue();
    for (let i = 0; i < arr.length; i++) {
      lcnmoneysum += arr[i]['nmoney'];
      lcsmoneysum += arr[i]['smoney'];
      lctmoneysum += arr[i]['tmoney'];
      lctotalmoney += arr[i]['total'];
    }
    this.parentForm().patchValue({
      nmoneysum: lcnmoneysum,
      smoneysum: lcsmoneysum,
      tmoneysum: lctmoneysum,
      totalmoney: lctotalmoney
    });

    this.refresh();
  }

  calcMei(row: number) {
    let rowData = this.frmArr.controls[row];
    rowCtl<RowField>(rowData).total.setValue(rowData.value.nmoney - rowData.value.smoney + rowData.value.tmoney);
    this.calcTot();
  }

  autoFil() {
    let i: number = 0;
    this.frmArr.controls
      .forEach(control => {
        control.patchValue({ line: i + 1 });
        i = i + 1;
      })
    this.refresh();
  }
  createRow(i: number, seiden?: Seiden | undefined) {
    return this.fb.group({
      line: [i],
      ptype: [seiden?.ptype, Validators.required],
      nmoney: [seiden?.nmoney],
      smoney: [seiden?.smoney],
      tmoney: [seiden?.tmoney],
      total: [seiden ? seiden.nmoney - seiden.smoney + seiden.tmoney : 0],
      mmemo: [seiden?.mmemo]
    })
  }
  refresh(): void {
    this.dataSource.data = this.frmArr.controls;
    this.clrsrv.subDep.next(true);
  }
  getMtbl(dno: number) {
    let dept: ClearInput[] = [];
    this.frmArr.controls
      .forEach(control => {
        dept.push({
          id: this.usrsrv.compid,
          kubun: 1,
          denno: dno,
          day: this.usrsrv.editFrmday(this.parentForm(), 'day'),
          line: this.usrsrv.editFrmval(control, 'line'),
          ptype: this.usrsrv.editFrmval(control, 'ptype'),
          nmoney: this.usrsrv.editFrmval(control, 'nmoney'),
          smoney: this.usrsrv.editFrmval(control, 'smoney'),
          tmoney: this.usrsrv.editFrmval(control, 'tmoney'),
          mmemo: this.usrsrv.editFrmval(control, 'mmemo')
        });
      });
    return dept;
  }
  setTbl() {
    this.frmArr.clear();
    let i: number = 0;
    this.clrsrv.nyuden.forEach(e => {
      this.frmArr.push(this.createRow(i + 1, e));
      this.calcMei(i);
      i += 1;
    });
    this.refresh();
  }
}
