import { Component, Inject, OnInit, ChangeDetectorRef, HostListener, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { MatLegacyTableDataSource as MatTableDataSource } from '@angular/material/legacy-table';
import { UntypedFormGroup, UntypedFormBuilder, FormControl, UntypedFormArray, Validators } from '@angular/forms';
import { MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA, MatLegacyDialogRef as MatDialogRef, MatLegacyDialog as MatDialog, MatLegacyDialogConfig as MatDialogConfig } from "@angular/material/legacy-dialog";
import { UserService } from './../../services/user.service';
import { GcdhelpComponent } from './../gcdhelp/gcdhelp.component';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-msprcprt',
  templateUrl: './msprcprt.component.html',
  styleUrls: ['./../../tbl.component.scss']
})
export class MsprcprtComponent implements OnInit {
  mcode: number;
  mode: number = 2;
  form: UntypedFormGroup;
  selrow;
  dataSource = new MatTableDataSource();
  @ViewChildren('upfile', { read: ElementRef }) inputs: QueryList<ElementRef>;
  displayedColumns = ['line', 'partno', 'seq', 'pic'];
  constructor(private fb: UntypedFormBuilder,
    private http: HttpClient,
    public usrsrv: UserService,
    public cdRef: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) data,
    private dialogRef: MatDialogRef<MsprcprtComponent>) {
    this.mcode = data.mcode;
  }

  ngOnInit(): void {
    this.form = this.fb.group({ mtbl: this.fb.array([]) });
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
    this.frmArr.insert(row, this.fb.group({
      line: [{ value: 0, disabled: true }],
      partno: [{ value: null, disabled: true }],
      seq: [{ value: null, disabled: true }]
    }));
    this.refresh();
  }
  get frmArr(): UntypedFormArray {
    return this.form.get('mtbl') as UntypedFormArray;
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
  selected(selected) {
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
