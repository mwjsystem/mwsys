import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GoodsService } from './../../mstgoods/goods.service';
import { UserService } from './../../services/user.service';
import { GcdhelpComponent } from './../gcdhelp/gcdhelp.component';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

interface AffectedRows { affected_rows: number }
/** get_goods クエリの結果（構成品の商品名・単位・数量区分） */
interface GoodsNameResult { msgoods_by_pk: { gtext: string; unit: string; gskbn: string } | null }
/** upd_msgzai ミューテーションの結果 */
interface UpdGzaiResult { delete_msgzai: AffectedRows; insert_msgzai: AffectedRows }
@Component({
    selector: 'app-gzai',
    templateUrl: './gzai.component.html',
    styleUrls: ['./../../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    }
})
export class GzaiComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<MatDialogRef<GzaiComponent>>(MatDialogRef);
  private dialog = inject(MatDialog);
  private apollo = inject(Apollo);
  usrsrv = inject(UserService);
  gdssrv = inject(GoodsService);
  cdRef = inject(ChangeDetectorRef);

  form: FormGroup;
  mode: number = 3;
  gcode: string;
  dataSource = new MatTableDataSource();
  displayedColumns = ['line', 'zcode', 'gtext', 'irisu', 'unit'];
  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    this.form = this.fb.group({ mtbl: this.fb.array([]) });
    this.gcode = data.gcode;
    const i: number = this.gdssrv.goods.findIndex(obj => obj.gcode == this.gcode);
    if (i > -1) {
      this.gdssrv.goods[i].msgzais.forEach(e => {
        this.frmArr.push(this.fb.group({
          line: [{ value: 0, disabled: true }],
          zcode: [e.zcode],
          gtext: [{ value: e.msgoods.gtext, disabled: true }],
          irisu: [e.irisu],
          gskbn: [e.msgoods.gskbn], // 構成品の数量区分。保存後に商品リストへ戻すために保持する（画面には出さない）
          unit: [{ value: e.msgoods.unit, disabled: true }]
        }));
      });
    }
    this.autoFil();
  }

  ngOnInit(): void { }
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }
  delRow(row: number) {
    this.frmArr.removeAt(row);
    this.autoFil();
  }
  insRow(row: number) {
    this.frmArr.insert(row, this.fb.group({
      line: [{ value: 0, disabled: true }],
      zcode: [""],
      gtext: [{ value: "", disabled: true }],
      irisu: [0],
      gskbn: [""],
      unit: [{ value: "", disabled: true }]
    }));
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
  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
  }
  cancel(): void {
    this.mode = 3;
    this.form.markAsPristine();
    this.refresh();
  }
  updGds(i: number, event: KeyboardEvent): void {
    this.getGds(i, (event.target as HTMLInputElement)?.value);
  }
  /** 商品コードを行に反映し、商品名・単位を取得する（直接入力と商品ヘルプの両方から呼ぶ） */
  getGds(i: number, value: string): void {
    let val: string = this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('zcode')!.setValue(val);
    const GetMast = gql`
    query get_goods($id: smallint!, $gcode: String!) {
      msgoods_by_pk(id:$id, gcode:$gcode) {
        gtext
        unit
        gskbn
      }
    }`;
    this.apollo.watchQuery<GoodsNameResult>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid,
        gcode: val
      }
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data.msgoods_by_pk);
        this.frmArr.controls[i].patchValue((data as GoodsNameResult).msgoods_by_pk ?? {});
      }, (error) => {
        this.usrsrv.toastWar("商品コード" + val + "は登録されていません");
        this.frmArr.controls[i].get('zcode')!.setErrors({ 'incorrect': true });
        console.log('error query get_goods', error);
      });
  }
  gcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.getGds(i, data.gcode);
        }
      }
    );
  }
  save() {
    const UpdateTran = gql`
      mutation upd_msgzai($id: smallint!, $gcd: String!,$obj:[msgzai_insert_input!]!) {
        delete_msgzai(where: {id: {_eq:$id},gcode: {_eq:$gcd}}) {
          affected_rows
        }
        insert_msgzai(objects: $obj) {
          affected_rows
        }
      }`;
    let objGzai: { id: number; gcode: string; zcode: string; irisu: number; }[] = [];
    let gzai: mwI.Gzai[] = [];
    this.frmArr.controls
      .forEach(control => {
        objGzai.push({
          id: this.usrsrv.compid,
          gcode: this.gcode,
          zcode: this.usrsrv.editFrmval(control, 'zcode'),
          irisu: this.usrsrv.editFrmval(control, 'irisu'),
        });
        gzai.push({
          zcode: control.value.zcode,
          irisu: control.value.irisu,
          msgoods: {
            gtext: control.value.gtext,
            unit: control.value.unit,
            gskbn: control.value.gskbn // 構成品の数量区分（セット在庫の計算は 0 の構成品だけを対象にする）
          }
        });
      });
    this.apollo.mutate<UpdGzaiResult>({
      mutation: UpdateTran,
      variables: {
        id: this.usrsrv.compid,
        gcd: this.gcode,
        obj: objGzai
      },
    }).subscribe(({ data }) => {
      this.usrsrv.toastSuc('セット商品内訳を更新しました');
      this.form.markAsPristine();
      this.cancel();
      const i: number = this.gdssrv.goods.findIndex(obj => obj.gcode == this.gcode);
      // console.log(this.frmArr.controls);
      if (i > -1) {
        this.gdssrv.goods[i].msgzais = gzai;
      }
    }, (error) => {
      this.usrsrv.toastErr('データベースエラー', 'セット商品内訳の更新ができませんでした');
      console.log('error mutation upd_msgzai', error);
    });



  }
  refresh(): void {
    this.dataSource.data = this.frmArr.controls;
    if (this.mode == 3) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    // this.cdRef.detectChanges();  
  }
  getInvalid(): string {
    let tooltip: string = "";
    return tooltip;
  }
  close() {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.dialogRef.close();
    }
  }
  shouldConfirmOnBeforeunload(): boolean {
    return this.form.dirty;
  }
  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }
}