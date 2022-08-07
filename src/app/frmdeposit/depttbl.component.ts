import { Component, OnInit, Input, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { DepositService } from './deposit.service';

@Component({
  selector: 'app-depttbl',
  templateUrl: './depttbl.component.html',
  styleUrls: ['./depttbl.component.scss']
})
export class DepttblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  dataSource = new MatTableDataSource();
  displayedColumns: string[] = ['line',
    'ptype',
    'nmoney',
    'smoney',
    'tmoney',
    'total',
    'mbiko'];
  constructor(private cdRef: ChangeDetectorRef,
    private fb: FormBuilder,
    public depsrv: DepositService,
    public bunsrv: BunruiService,
    public usrsrv: UserService) { }

  ngOnInit(): void {
    this.insRow(0);
    this.depsrv.observeD.subscribe((nyuden) => {
      // this.dataSource = new MatTableDataSource<Nyuden>(nyuden);
      this.cdRef.detectChanges();
    });
  }
  get frmArr(): FormArray {
    return this.parentForm.get('mtbl') as FormArray;
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
    this.parentForm.patchValue({
      nmoneysum: lcnmoneysum,
      smoneysum: lcsmoneysum,
      tmoneysum: lctmoneysum,
      totalmoney: lctotalmoney
    });

    this.refresh();
  }

  calcMei(row: number) {
    let rowData = this.frmArr.controls[row];
    rowData.get('total').setValue(rowData.value.nmoney - rowData.value.smoney + rowData.value.tmoney);
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
  createRow(i: number, deposit?) {
    return this.fb.group({
      line: [i],
      ptype: [deposit?.ptype, Validators.required],
      nmoney: [deposit?.nmoney],
      smoney: [deposit?.smoney],
      tmoney: [deposit?.tmoney],
      total: [deposit?.nmoney - deposit?.smoney + deposit?.tmoney],
      mbiko: [deposit?.mbiko]
    })
  }
  refresh(): void {
    this.dataSource.data = this.frmArr.controls;
    this.depsrv.subDep.next(true);
  }
  getMtbl(dno) {
    let dept = [];
    this.frmArr.controls
      .forEach(control => {
        dept.push({
          id: this.usrsrv.compid,
          kubun: 0,
          denno: dno,
          day: this.usrsrv.editFrmday(this.parentForm, 'day'),
          line: this.usrsrv.editFrmval(control, 'line'),
          ptype: this.usrsrv.editFrmval(control, 'ptype'),
          nmoney: this.usrsrv.editFrmval(control, 'nmoney'),
          smoney: this.usrsrv.editFrmval(control, 'smoney'),
          tmoney: this.usrsrv.editFrmval(control, 'tmoney'),
          mbiko: this.usrsrv.editFrmval(control, 'mbiko')
        });
      });
    return dept;
  }
  set_tbl() {
    this.frmArr.clear();
    let i: number = 0;
    this.depsrv.nyuden.forEach(e => {
      this.frmArr.push(this.createRow(i + 1, e));
      this.calcMei(i);
      i += 1;
    });
    // console.log(this.frmArr);
    this.refresh();
  }
}
