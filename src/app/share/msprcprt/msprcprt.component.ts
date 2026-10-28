import { Component, OnInit, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, viewChildren, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { FormArray, FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { UserService } from './../../services/user.service';
import { GcdhelpComponent } from './../gcdhelp/gcdhelp.component';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { HttpClient } from '@angular/common/http';
import { MatToolbar } from '@angular/material/toolbar';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatFormField, MatInput } from '@angular/material/input';
import { BeforeunloadBase } from '../../beforeunload-base';

type PartRowControls = {
  line: FormControl<number | null>;
  partno: FormControl<number | null>;
  seq: FormControl<number | null>;
};

@Component({
    selector: 'app-msprcprt',
    templateUrl: './msprcprt.component.html',
    styleUrls: ['./../../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatDialogTitle, CdkScrollable, MatDialogContent, FormsModule, ReactiveFormsModule, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatFormField, MatInput, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatDialogActions]
})
export class MsprcprtComponent extends BeforeunloadBase implements OnInit {
  private http = inject(HttpClient);
  usrsrv = inject(UserService);
  cdRef = inject(ChangeDetectorRef);
  private dialogRef = inject<MatDialogRef<MsprcprtComponent>>(MatDialogRef);

  mcode: number;
  mode: number = 2;
  form!: FormGroup<{ mtbl: FormArray<FormGroup<PartRowControls>> }>;
  selrow: FormGroup<PartRowControls> | undefined;
  dataSource = new MatTableDataSource();
  readonly inputs = viewChildren('upfile', { read: ElementRef });
  displayedColumns = ['line', 'partno', 'seq', 'pic'];
  constructor() {
    super();
    const data = inject(MAT_DIALOG_DATA);

    this.mcode = data.mcode;
  }

  ngOnInit(): void {
    this.form = new FormGroup({ mtbl: new FormArray<FormGroup<PartRowControls>>([]) });
    this.ins_row(1);
  }
  // async newPno(i: number) {
  //   let lcpno: number = await this.usrsrv.getNumber(this.frmArr.getRawValue()[i]['prckbn'] + 'partno', 1,);
  //   this.frmArr.controls[i].patchValue({ patno: lcpno, seq: 1 });
  //   this.refresh();
  // }
  // copyPno(i: number) {
  //   if (i > 0) {
  //     this.frmArr.controls[i].patchValue({ patno: this.frmArr.getRawValue()[i - 1]['partno'], seq: +this.frmArr.getRawValue()[i - 1]['seq'] + 1 });
  //   }
  //   this.refresh();
  // }
  // del_row(row: number) {
  //   this.frmArr.removeAt(row);
  //   this.refresh();
  // }
  ins_row(row: number) {
    this.frmArr.insert(row, new FormGroup<PartRowControls>({
      line: new FormControl<number | null>({ value: 0, disabled: true }),
      partno: new FormControl<number | null>({ value: null, disabled: true }),
      seq: new FormControl<number | null>({ value: null, disabled: true })
    }));
    this.refresh();
  }
  get frmArr(): FormArray<FormGroup<PartRowControls>> {
    return this.form.controls.mtbl;
  }
  // modeToUpd(): void {
  //   this.mode = 2;
  //   this.refresh();
  // }
  // cancel(): void {
  //   this.mode = 3;
  //   this.form.markAsPristine();
  //   this.refresh();
  // }
  refresh(): void {
    this.dataSource.data = this.frmArr.controls;
    // if (this.mode == 3) {
    //   this.form.disable();
    // } else {
    //   this.form.enable();
    // }
    this.cdRef.detectChanges();
  }
  // save(): void {
  //   this.mode = 3;
  //   this.form.disable();
  //   this.form.markAsPristine();
  // }
  close() {
    this.dialogRef.close();
  }
  closeSet() {
    this.dialogRef.close(this.selrow);
  }
  selected(selected: FormGroup<PartRowControls>) {
    this.selrow = selected;
  }
  // onClickFileInputButton(num: number) {
  //   // console.log(this.inputs);
  //   this.inputs.toArray()[num].nativeElement.click();
  // }
  // //アップロードの実行
  // onchange(list: any, i: number) {
  //   // ファイルが指定されていなければ
  //   if (list.length <= 0) { return; }

  //   // ファイルを取得
  //   let f = list[0];
  //   // console.log(list);
  //   // ファイルをセット
  //   let data = new FormData();
  //   data.append('upfile', f, this.frmArr.getRawValue()[i]['partno'] + ".jpg");

  //   // サーバーに送信(画像データがあるので、POST)
  //   this.http.post(this.usrsrv.system.imgurl + 'index.php?topath=./proc/&func=ins', data, { responseType: 'text' })
  //     .subscribe(
  //       data => this.cdRef.detectChanges(),
  //       error => console.log(error)
  //     );
  // }
  // //ファイルの削除
  // delImg(i: number) {
  //   // サーバーに送信(ファイル名のみなので、GET)
  //   this.http.get(this.usrsrv.system.imgurl + 'index.php?topath=./proc/&func=del&file=' + this.frmArr.getRawValue()[i]['partno'] + '.jpg', { responseType: 'text' })
  //     .subscribe(
  //       data => {
  //         this.usrsrv.toastWar('画像を削除しました(しばらくすれば、画面からも消えます)');
  //         this.cdRef.detectChanges();
  //       },
  //       error => console.log(error)
  //     );
  // }

}
