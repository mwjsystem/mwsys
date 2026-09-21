import { Component, OnInit, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, viewChildren, inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogConfig } from "@angular/material/dialog";
import { TreatService } from './treat.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
// import { ToastrService } from 'ngx-toastr';
import { HttpClient } from '@angular/common/http';

/** 問合せ詳細フォーム。seq / created_at / created_by は、新規登録時に表示用の値が入るため型を広げている */
type TrtForm = {
  seq: FormControl<string | number>;
  created_at: FormControl<Date | string>;
  created_by: FormControl<number | string>;
  trttype: FormControl<string>;
  genre: FormControl<string>;
  mcode: FormControl<string | number>;
  grpcode: FormControl<string>;
  gcode: FormControl<string>;
  tel: FormControl<string>;
  email: FormControl<string>;
  question: FormControl<string>;
  answer: FormControl<string>;
  kaizen: FormControl<string>;
  result: FormControl<string>;
};

@Component({
    selector: 'app-trtdetail',
    templateUrl: './trtdetail.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TrtdetailComponent implements OnInit {
  trtsrv = inject(TreatService);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  stfsrv = inject(StaffService);
  cdRef = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private apollo = inject(Apollo);
  private http = inject(HttpClient);
  private dialogRef = inject<MatDialogRef<TrtdetailComponent>>(MatDialogRef);


  public idx: number = 0;
  public form!: FormGroup<TrtForm>;
  readonly inputs = viewChildren('upfile', { read: ElementRef });
  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    this.idx = data.idx;
  }

  ngOnInit(): void {
    this.form = new FormGroup<TrtForm>({
      seq: new FormControl<string | number>('', { nonNullable: true }),
      created_at: new FormControl<Date | string>('', { nonNullable: true }),
      created_by: new FormControl<number | string>('', { nonNullable: true }),
      trttype: new FormControl<string>('', { nonNullable: true }),
      genre: new FormControl<string>('', { nonNullable: true }),
      mcode: new FormControl<string | number>('', { nonNullable: true }),
      grpcode: new FormControl<string>('', { nonNullable: true }),
      gcode: new FormControl<string>('', { nonNullable: true }),
      tel: new FormControl<string>('', { nonNullable: true }),
      email: new FormControl<string>('', { nonNullable: true }),
      question: new FormControl<string>('', { nonNullable: true }),
      answer: new FormControl<string>('', { nonNullable: true }),
      kaizen: new FormControl<string>('', { nonNullable: true }),
      result: new FormControl<string>('', { nonNullable: true }),
    });
    if (this.idx == -1) {
      this.form.controls.seq.setValue("新規登録");
      this.form.controls.created_at.setValue(new Date());
      this.form.controls.created_by.setValue(this.usrsrv.staff.code);
    } else {
      this.form.patchValue(this.trtsrv.trts[this.idx]);
    }
  }

  setNext() {
    if (this.idx < this.trtsrv.trts.length && this.idx > -1) {
      this.idx += 1;
      this.form.patchValue(this.trtsrv.trts[this.idx]);
      this.cdRef.detectChanges();
    }
  }

  setPrev() {
    if (this.idx > 1) {
      this.idx -= 1;
      this.form.patchValue(this.trtsrv.trts[this.idx]);
      this.cdRef.detectChanges();
    }
  }

  onchange(list: any, num: string) {
    // ファイルが指定されていなければ
    if (list.length <= 0) { return; }

    // ファイルを取得
    let f = list[0];
    // console.log(list);
    // ファイルをセット
    let data = new FormData();
    data.append('upfile', f, this.form.value.seq + "_" + num + ".jpg");

    // サーバーに送信(画像データがあるので、POST)
    this.http.post('https://mwjapan.sakura.ne.jp/mwjsys/index.php?topath=./treat/&file=ins', data, { responseType: 'text' })
      .subscribe(
        data => {
          this.usrsrv.toastSuc('画像を登録しました');
          this.cdRef.detectChanges();
        },
        error => console.log(error)
      );
  }

  delImg(num: string) {
    // サーバーに送信(ファイル名のみなので、GET)
    this.http.get('https://mwjapan.sakura.ne.jp/mwjsys/index.php?topath=./treat/&file=' + this.form.value.seq + '_' + num + '.jpg', { responseType: 'text' })
      .subscribe(
        data => {
          this.usrsrv.toastSuc('画像を削除しました');
          this.cdRef.detectChanges();
        },
        error => console.log(error)
      );
  }

  mcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);
    this.cdRef.detach();
    dialogRef.afterClosed().subscribe(
      data => {
        this.cdRef.reattach();
        if (typeof data != 'undefined') {
          this.form.controls.mcode.setValue(+data.mcode);
        }
      }
    );
  }

  onClickFileInputButton(num: number) {
    // console.log(this.inputs);
    this.inputs()[num].nativeElement.click();
  }

  async save() {
    const InsertTran = gql`
    mutation ins_treat($object: [trtreat_insert_input!]!) {
      insert_trtreat(objects: $object) {
        affected_rows
      }
    }`;
    const UpdateTran = gql`
    mutation upd_treat($id: smallint!, $seq: Int!,$_set: trtreat_set_input!) {
      update_trtreat(where: {id: {_eq: $id},seq: {_eq:$seq}}, _set: $_set) {
        affected_rows
      }
    }`;
    let treat: any = {
      id: this.usrsrv.compid,
      genre: this.usrsrv.editFrmval(this.form, 'genre'),
      mcode: this.usrsrv.editFrmval(this.form, 'mcode'),
      grpcode: this.usrsrv.editFrmval(this.form, 'grpcode'),
      gcode: this.usrsrv.editFrmval(this.form, 'gcode'),
      tel: this.usrsrv.editFtel(this.form, 'tel'),
      email: this.usrsrv.editFrmval(this.form, 'email'),
      question: this.usrsrv.editFrmval(this.form, 'question'),
      answer: this.usrsrv.editFrmval(this.form, 'answer'),
      kaizen: this.usrsrv.editFrmval(this.form, 'kaizen'),
      result: this.usrsrv.editFrmval(this.form, 'result'),
    }
    if (this.idx == -1) {
      // this.usrsrv.getNumber('treat',1)
      //   .subscribe(value => {
      let value = await this.usrsrv.getNumber('treat', 1);
      this.form.controls.seq.setValue(value);
      this.idx = 0;
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          "object": { id: this.usrsrv.compid, seq: value, created_at: new Date(), created_by: this.usrsrv.staff.code, ...treat }
        },
      }).subscribe(({ data }) => {
        this.usrsrv.toastSuc('問合せ対応を新規登録しました');
      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '問合せ対応の新規登録ができませんでした');
        console.log('error ins_treat', error);
      });
      // });  
    } else {
      this.apollo.mutate<any>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          seq: this.form.value.seq,
          "_set": treat
        },
      }).subscribe(({ data }) => {
        this.usrsrv.toastSuc('問合せ対応の変更を保存しました');

      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '問合せ対応の変更保存ができませんでした');
        console.log('error upd_treat', error);
      });
    }
    // console.log(this.idx,this.trtsrv.trts[this.idx]);
  }

  close() {
    this.dialogRef.close();
  }

}
