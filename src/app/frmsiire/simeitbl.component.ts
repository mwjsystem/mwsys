import { Component, OnInit, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, input, viewChild, viewChildren, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { HmeihelpComponent } from './../share/hmeihelp/hmeihelp.component';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StoreService } from './../services/store.service';
import { SiimeiService } from './siimei.service';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
// import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs/operators';

/** 保存時に仕入明細（trsiimei）へ渡す値。inday は日付文字列（未入力は null） */
type SiimeiInput = Pick<mwI.Siimei, 'line' | 'inday' | 'gcode' | 'suu' | 'genka' | 'money' | 'taxrate' | 'mmemo' | 'spec' | 'hdenno' | 'hline' | 'mtax'> & {
  id: number;
  denno: number;
};

@Component({
    selector: 'app-simeitbl',
    templateUrl: './simeitbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SimeitblComponent implements OnInit {
  private cdRef = inject(ChangeDetectorRef);
  private elementRef = inject(ElementRef);
  private dialog = inject(MatDialog);
  private fb = inject(FormBuilder);
  private apollo = inject(Apollo);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  smisrv = inject(SiimeiService);
  strsrv = inject(StoreService);

  readonly parentForm = input.required<FormGroup>();
  readonly paginator = viewChild(MatPaginator);
  readonly gcdInps = viewChildren<ElementRef>('gcdInputs');
  private el!: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard!: string;
  navCli = navigator.clipboard;
  displayedColumns = [
    'line',
    'hdenno',
    'hline',
    'gcode',
    'gtext',
    'suu',
    'unit',
    'genka',
    'money',
    'mmemo',
    'spec',
    // 'inday',
    'mtax',
    'taxrate',
    // 'currency'
  ];

  ngOnInit(): void {
    this.addRows(1);
    this.refresh();
  }
  calcTot() {
    let lcgtotal: number = 0;
    let lctax: number = 0;
    this.frmArr.controls
      .forEach(control => {
        if (control.value.gcode !== '') {
          const lcmoney: number = control.value.genka * control.value.suu;
          control.patchValue({ money: lcmoney });
          lcgtotal += lcmoney;
          if (control.value.mtax == '0') {
            lctax += (lcmoney * +control.value.taxrate / 100)
          }
        }
      })
    this.parentForm().patchValue({ gtotal: lcgtotal, tax: lctax, total: lcgtotal + lctax });
    this.smisrv.subject.next(true);
    this.refresh();
  }
  createRow(i: number, siimei?: mwI.Siimei) {
    return this.fb.group({
      line: [{ value: i, disabled: true }],
      hdenno: [siimei?.hdenno, Validators.required],
      hline: [siimei?.hline, Validators.required],
      gcode: [{ value: siimei?.gcode, disabled: true }],
      gtext: [{ value: siimei?.msgood.gtext, disabled: true }],
      suu: [siimei?.suu, Validators.required],
      genka: [siimei?.genka],
      money: [siimei?.money],
      taxrate: [siimei?.taxrate],
      unit: [{ value: siimei?.msgood.unit, disabled: true }],
      mmemo: [siimei?.mmemo],
      spec: [siimei?.spec],
      mtax: [siimei?.mtax],
    });
  }
  delRow(row: number) {
    this.frmArr.removeAt(row);
    this.autoFil();
  }
  insRow(row: number) {
    this.frmArr.insert(row, this.createRow(row));
    this.autoFil();
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

  refresh(): void {
    this.dataSource.paginator = this.paginator() ?? null;
    this.dataSource.data = this.frmArr.controls;
  }

  addRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.frmArr.push(this.createRow(i + 1));
    }
    this.refresh();
  }
  get frmArr(): FormArray {
    // console.log(this.parentForm);    
    return this.parentForm().get('mtbl') as FormArray;
  }
  pasteFromClipboard(flg: boolean) {
    // if(navigator.clipboard){
    navigator.clipboard.readText()
      .then((text) => {
        console.log(text);
        let rowData = text.split("\n");
        this.insRows(rowData, flg);
        this.parentForm().markAsDirty();
      });
    // }
  }
  insRows(rowData: string[], flg: boolean) {
    let i: number = 0;
    if (flg) {
      this.frmArr.clear();
    } else {
      i = this.frmArr.length;
    }
    rowData.forEach((row) => {
      let col = row.split("\t");
      if (col[0] != "") {
        let smei: mwI.Siimei = {
          line: i,
          gcode: col[0],
          suu: +col[1],
          genka: 0,
          money: 0,
          taxrate: '',
          msgood: { gtext: '', unit: '' },
          mmemo: '',
          spec: '',
          hdenno: +col?.[2],
          hline: +col?.[3],
          inday: null,
          mtax: ''
          // currency:''
        }
        this.frmArr.push(this.createRow(i + 1, smei));
        // console.log(this.updateRow(i+1,hmei));
        // this.updGds(i, col[0]);
        i += 1;
      };
    });
    this.refresh();
  }
  copyData() {
    this.copyToClipboard = this.objectToArray(this.displayedColumns);
    this.frmArr.getRawValue().forEach(row => {
      if (row.gcode !== '') {
        this.copyToClipboard += this.objectToArray(row);
      }
    })
    this.usrsrv.toastInf('クリップボードにコピーしました');
  }
  getIdx(index: number) {
    const paginator = this.paginator() ?? null;
    if (paginator) {
      return index + paginator.pageSize * paginator.pageIndex;
    } else {
      return index;
    }
  }
  getSiimei(dno: number) {
    let siimei: SiimeiInput[] = [];
    this.frmArr.controls
      .forEach(control => {
        siimei.push({
          id: this.usrsrv.compid,
          denno: dno,
          line: this.usrsrv.editFrmval(control, 'line'),
          inday: this.usrsrv.editFrmday(control, 'inday'),
          gcode: this.usrsrv.editFrmval(control, 'gcode'),
          suu: this.usrsrv.editFrmval(control, 'suu'),
          genka: this.usrsrv.editFrmval(control, 'genka'),
          money: this.usrsrv.editFrmval(control, 'money'),
          taxrate: this.usrsrv.editFrmval(control, 'taxrate'),
          mmemo: this.usrsrv.editFrmval(control, 'mmemo'),
          spec: this.usrsrv.editFrmval(control, 'spec'),
          hdenno: this.usrsrv.editFrmval(control, 'jdenno'),
          hline: this.usrsrv.editFrmval(control, 'jline'),
          mtax: this.usrsrv.editFrmval(control, 'mtax')
        });
      });
    return siimei;
  }
  hmeihelp(i: number) {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      vcode: this.parentForm().value.vcode,
      gcode: this.frmArr.controls[i].value.gcode
    };
    let dialogRef = this.dialog.open(HmeihelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.frmArr.controls[i].patchValue(data);
          this.frmArr.controls[i].patchValue({ hdenno: data.denno, hline: data.line, unit: data.msgood.unit });
        }
      }
    );
  }
  objectToArray(obj: object): string {
    var result = Object.keys(obj).map((key: string) => {
      let value = (obj as Record<string, unknown>)[key];
      // console.log(value)
      return value;
    });
    // console.log(result.toString())
    return result.toString() + "\n";
  }
  setSiimei() {
    let i: number = 0;
    this.frmArr.clear();
    // console.log(this.smisrv.siimei, flg);
    this.smisrv.siimei.forEach(e => {
      this.frmArr.push(this.createRow(i + 1, e));
      i += 1;
      // console.log(this.frmArr);
    });
    this.autoFil();
  }
}
