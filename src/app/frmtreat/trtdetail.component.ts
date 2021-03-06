import { Component, Inject, OnInit, ChangeDetectorRef, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';
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

@Component({
  selector: 'app-trtdetail',
  templateUrl: './trtdetail.component.html',
  styleUrls: ['./trtdetail.component.scss']
})
export class TrtdetailComponent implements OnInit {

  public idx: number = 0;
  public form: FormGroup;
  @ViewChildren('upfile', { read: ElementRef }) inputs: QueryList<ElementRef>;
  constructor(public trtsrv: TreatService,
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    public stfsrv: StaffService,
    public cdRef: ChangeDetectorRef,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private apollo: Apollo,
    // private toastr: ToastrService,
    private http: HttpClient,
    private dialogRef: MatDialogRef<TrtdetailComponent>,
    @Inject(MAT_DIALOG_DATA) data) {
    this.idx = data.idx;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      seq: new FormControl(''),
      created_at: new FormControl(''),
      created_by: new FormControl(''),
      trttype: new FormControl(''),
      genre: new FormControl(''),
      mcode: new FormControl(''),
      grpcode: new FormControl(''),
      gcode: new FormControl(''),
      tel: new FormControl(''),
      email: new FormControl(''),
      question: new FormControl(''),
      answer: new FormControl(''),
      kaizen: new FormControl(''),
      result: new FormControl(''),
    });
    if (this.idx == -1) {
      this.form.get('seq').setValue("????????????");
      this.form.get('created_at').setValue(new Date());
      this.form.get('created_by').setValue(this.usrsrv.staff.code);
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
    // ?????????????????????????????????????????????
    if (list.length <= 0) { return; }

    // ?????????????????????
    let f = list[0];
    // console.log(list);
    // ????????????????????????
    let data = new FormData();
    data.append('upfile', f, this.form.value.seq + "_" + num + ".jpg");

    // ?????????????????????(?????????????????????????????????POST)
    this.http.post('https://mwjapan.sakura.ne.jp/mwjsys/index.php?topath=./treat/&file=ins', data, { responseType: 'text' })
      .subscribe(
        data => {
          this.usrsrv.toastSuc('???????????????????????????');
          this.cdRef.detectChanges();
        },
        error => console.log(error)
      );
  }

  delImg(num: string) {
    // ?????????????????????(?????????????????????????????????GET)
    this.http.get('https://mwjapan.sakura.ne.jp/mwjsys/index.php?topath=./treat/&file=' + this.form.value.seq + '_' + num + '.jpg', { responseType: 'text' })
      .subscribe(
        data => {
          this.usrsrv.toastSuc('???????????????????????????');
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
          this.form.get('mcode').setValue(+data.mcode);
        }
      }
    );
  }

  onClickFileInputButton(num: number) {
    // console.log(this.inputs);
    this.inputs.toArray()[num].nativeElement.click();
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
      this.form.get('seq').setValue(value);
      this.idx = 0;
      this.apollo.mutate<any>({
        mutation: InsertTran,
        variables: {
          "object": { id: this.usrsrv.compid, seq: value, created_at: new Date(), created_by: this.usrsrv.staff.code, ...treat }
        },
      }).subscribe(({ data }) => {
        this.usrsrv.toastSuc('??????????????????????????????????????????');
      }, (error) => {
        this.usrsrv.toastErr('???????????????????????????', '?????????????????????????????????????????????????????????');
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
        this.usrsrv.toastSuc('?????????????????????????????????????????????');

      }, (error) => {
        this.usrsrv.toastErr('???????????????????????????', '?????????????????????????????????????????????????????????');
        console.log('error upd_treat', error);
      });
    }
    // console.log(this.idx,this.trtsrv.trts[this.idx]);
  }

  close() {
    this.dialogRef.close();
  }

}
