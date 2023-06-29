import { Component, OnInit, Input, ViewChild, ViewChildren, QueryList, ElementRef, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { UserService } from './../services/user.service';
import { StockService } from './../services/stock.service';
import { Zaiko, Gzai, Movden, MovingService } from './moving.service';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-movtbl',
  templateUrl: './movtbl.component.html',
  styleUrls: ['./../tbl.component.scss']
})
export class MovtblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  @ViewChildren('gcdInputs') gcdInps: QueryList<ElementRef>;
  private el: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard: string;
  navCli = navigator.clipboard;
  setZai = [];
  public trzaiko: Zaiko[] = [];
  displayedColumns: string[] = ['line',
    'gcode',
    'gtext',
    'suu',
    'unit',
    'pable',
    'stock',
    'memo',
    'jdenno',
    'jline'];


  constructor(private cdRef: ChangeDetectorRef,
    private elementRef: ElementRef,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private apollo: Apollo,
    public movsrv: MovingService,
    public stcsrv: StockService,
    public usrsrv: UserService) { }

  ngOnInit(): void {
    this.addRows(1);
    this.refresh();
  }
  setAll(chked: boolean) {
    this.frmArr.controls
      .forEach(control => {
        if (control.value.gcode !== '') {
          control.patchValue({ chk: chked });
        }
      })
    this.refresh();
  }
  gcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      gcode: this.frmArr.controls[i].value.gcode,
      tkbn: ['0', '1']
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.updGds(i, data.gcode);

        }
      }
    );
  }

  updGds(i: number, value: string): void {
    let val: string = this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('gcode').setValue(val);
    const GetGood = gql`
    query get_good($id: smallint!,$gds:String!) {
      msgoods_by_pk(gcode: $gds, id: $id){
        gcode
        gtext
        unit
        gskbn
        msgzais {
          zcode
          irisu
          msgoods {
            gskbn
          }
        }
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetGood,
      variables: {
        id: this.usrsrv.compid,
        gds: val
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        let msgds = data.msgoods_by_pk;

        if (msgds == null) {
          this.usrsrv.toastWar("商品コード" + val + "は登録されていません");
          this.frmArr.controls[i].get('gcode').setErrors({ 'incorrect': true });
        } else {
          console.log(msgds);
          this.frmArr.controls[i].get('gcode').setErrors(null);
          this.frmArr.controls[i].patchValue(msgds);
          msgds.msgzais.forEach(e => {
            let arr = []
            if (e.msgoods.gskbn == "0") {
              this.getMtbl(i, 'msgzais').push(this.fb.group({ zcode: e.zcode, irisu: e.irisu }));
            }
          });
          this.setPable(i, val, msgds.msgzais);
        }
        this.movsrv.subject.next(true);
      }, (error) => {
        console.log('error query get_good', error);
      });
  }
  getMtbl(i: number, fnm: string): FormArray {
    return this.frmArr.controls[i].get(fnm) as FormArray;
  }
  createRow(i: number, movden?: Movden) {
    let lcArr: FormArray = this.fb.array([]);
    if (movden?.msgood.gskbn == "1") {
      movden.msgood.msgzais.forEach(e => {
        if (e.msgoods.gskbn == "0") {
          lcArr.push(this.fb.group({ zcode: e.zcode, irisu: e.irisu, msgoods: e.msgoods }));
        }
      });
    }
    return this.fb.group({
      chk: [''],
      line: [{ value: i, disabled: true }],
      gcode: [movden?.gcode, Validators.required],
      gtext: [movden?.msgood.gtext],
      suu: [movden?.suu, Validators.required],
      unit: [movden?.msgood.unit],
      gskbn: [movden?.msgood.gskbn],
      pable: [{ value: movden?.pable, disabled: true }],
      stock: [{ value: movden?.stock, disabled: true }],
      memo: [movden?.memo],
      jdenno: [movden?.jdenno],
      jline: [movden?.jline],
      kako: [movden?.kako],
      msgzais: lcArr,
    });
  }

  setPable(i: number, gcd: string, msgzais: any) {
    // console.log(gcd, this.parentForm.get('incode').value);
    if (this.frmArr.controls[i].value.gskbn == "0") {
      this.stcsrv.getStock(gcd, this.frmArr.controls[i].value.gskbn, this.parentForm.get('outcode').value).then(result => {
        // console.log(result);
        this.frmArr.controls[i].patchValue({ pable: ((result[0]?.stock - result[0]?.hikat - result[0]?.keepd) || 0) });
        // console.log(this.frmArr);
        this.movsrv.subject.next(true);
      });
      this.stcsrv.getStock(gcd, this.frmArr.controls[i].value.gskbn, this.parentForm.get('incode').value).then(result => {
        // console.log(result);
        this.frmArr.controls[i].patchValue({ stock: ((result[0]?.stock - result[0]?.hikat - result[0]?.keepd) || 0) });
        // console.log(this.frmArr);
        this.movsrv.subject.next(true);
      });
    } else if (this.frmArr.controls[i].value.gskbn == "1") {
      this.stcsrv.getSetZai(this.parentForm.get('outcode').value, msgzais).then(result => {
        this.setZai[i] = result;
        this.frmArr.controls[i].patchValue({ pable: this.stcsrv.getPaabl(result) });
        this.movsrv.subject.next(true);
      });
      this.stcsrv.getSetZai(this.parentForm.get('incode').value, msgzais).then(result => {
        this.setZai[i] = result;
        this.frmArr.controls[i].patchValue({ stock: this.stcsrv.getPaabl(result) });
        this.movsrv.subject.next(true);
      });
    }
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
  addRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.frmArr.push(this.createRow(i + 1));
    }
    this.refresh();
  }
  get frmArr(): FormArray {
    // console.log(this.parentForm);    
    return this.parentForm.get('mtbl') as FormArray;
  }
  frmVal(i: number, fld: string): string {
    return this.frmArr.getRawValue()[i][fld];
  }
  pasteFromClipboard(flg: boolean) {
    // if(navigator.clipboard){
    navigator.clipboard.readText()
      .then((text) => {
        console.log(text);
        let rowData = text.split("\n");
        this.insRows(rowData, flg);
        this.parentForm.markAsDirty();
      });
    // }
  }
  insRows(rowData, flg: boolean) {
    let i: number = 0;
    if (flg) {
      this.frmArr.clear();
    } else {
      i = this.frmArr.length;
    }
    rowData.forEach(row => {
      let col = row.split("\t");
      if (col[0] != "") {
        let movden: Movden = {
          line: i,
          gcode: col[0],
          suu: +col[1],
          pable: 0,
          stock: 0,
          memo: '',
          jdenno: 0,
          jline: 0,
          kako: '',
          msgood: {
            gtext: '',
            unit: '',
            gskbn: '',
            msgzais: [],
          },
        }
        this.frmArr.push(this.createRow(i + 1, movden));
        // console.log(this.updateRow(i+1,hmei));
        this.updGds(i, col[0]);
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

  getMovmei(dno) {
    let movmei = [];
    this.frmArr.controls
      .forEach(control => {
        movmei.push({
          id: this.usrsrv.compid,
          denno: dno,
          line: this.usrsrv.editFrmval(control, 'line'),
          gcode: this.usrsrv.editFrmval(control, 'gcode'),
          gtext: this.usrsrv.editFrmval(control, 'gtext'),
          suu: this.usrsrv.editFrmval(control, 'suu'),
          memo: this.usrsrv.editFrmval(control, 'mbiko')
        });
      });
    return movmei;
  }
  objectToArray(obj: object): string {
    var result = Object.keys(obj).map((key: keyof typeof obj) => {
      let value = obj[key];
      // console.log(value)
      return value;
    });
    // console.log(result.toString())
    return result.toString() + "\n";
  }
  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data = this.frmArr.controls;
    this.movsrv.subject.next(true);
  }
  setMovmei(movdens: Movden[]) {
    this.frmArr.clear();
    let i: number = 0;
    movdens.forEach(e => {
      this.frmArr.push(this.createRow(i + 1, e));
      this.setPable(i, e.gcode, e.msgood.msgzais);
      i += 1;
      // console.log(e);

      e.msgood.msgzais.forEach(zai => {
        this.trzaiko.push({
          scode: this.parentForm.get('incode').value,
          gcode: zai.zcode,
          day: this.parentForm.get('day').value,
          movi: e.suu * zai.irisu * -1,
          movo: 0
        });
        this.trzaiko.push({
          scode: this.parentForm.get('outcode').value,
          gcode: zai.zcode,
          day: this.parentForm.get('day').value,
          movi: 0,
          movo: e.suu * zai.irisu * -1,
        });
      });
    });
    this.refresh();
  }

  addNewrow(i: number) {

    this.gcdInps.changes.pipe(take(1)).subscribe({
      next: changes => {
        changes.last.nativeElement.focus()
        // console.log(changes.last);
      }
    })
    // console.log(i,this.frmArr.length);
    if (i + 1 == this.frmArr.length) {
      this.frmArr.push(this.createRow(i + 2));
    }
    this.refresh();
    // console.log(this.gcdInps);
    // this.gcdInps.last.nativeElement.focus();
    // ((this.frmArr.at(i+1) as FormGroup).controls['gcode']as any).nativeElement = this.elementRef.nativeElement;
    // ((this.frmArr.at(i+1) as FormGroup).controls['gcode']as any).nativeElement.focus();
  }
  getIdx(index: number) {
    if (this.paginator) {
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else {
      return index;
    }
    // console.log(index);
  }
}
