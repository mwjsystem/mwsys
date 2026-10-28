import { Component, OnInit, AfterViewInit, ViewChild, ViewEncapsulation, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, output, input, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { Apollo } from 'apollo-angular';
import * as Query from './queries.mstg';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { StockService, GzaiRef } from './../services/stock.service';
import { GoodsService } from './goods.service';
import { BunruiService } from './../services/bunrui.service';
import { GzaiComponent } from './../share/gzai/gzai.component';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatPrefix, MatFormField, MatInput, MatSuffix, MatLabel } from '@angular/material/input';
import { TabDirective } from '../core/directives/tabidx/tab.directive';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { MatCheckbox } from '@angular/material/checkbox';
import { DecimalPipe } from '@angular/common';
import { rowCtl } from '../core/form-helpers';

/** 単価行の追加(flg=true)・削除(flg=false)を、親の mstgoods へ伝えるイベントの値 */
export type TnkAction = { flg: boolean; row: number; flgCP?: boolean };

/** 商品コードの重複確認クエリの結果（登録済みの商品グループ） */
interface GoodsCheckResult { msgoods: { msggroup: { code: string } }[] }

/** 明細の 1 行のフォーム項目名 */
type RowField = 'ins' | 'gcode' | 'gtext' | 'size' | 'color' | 'pable' | 'unit' | 'gskbn' | 'jan' | 'weight' | 'tkbn' | 'max' | 'send' | 'ordering' | 'koguchi' | 'lot' | 'vgcode' | 'hgcode';

@Component({
    selector: 'app-gdstbl',
    templateUrl: './gdstbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, ReactiveFormsModule, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatIconButton, MatIcon, MatCellDef, MatCell, MatPrefix, MatFormField, MatInput, TabDirective, MatSelect, MatOption, MatButton, MatSuffix, MatTooltip, MatCheckbox, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatLabel, MatPaginator, DecimalPipe]
})
export class GdstblComponent {
  private cdRef = inject(ChangeDetectorRef);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private apollo = inject(Apollo);
  usrsrv = inject(UserService);
  strsrv = inject(StoreService);
  stcsrv = inject(StockService);
  gdssrv = inject(GoodsService);
  bunsrv = inject(BunruiService);

  readonly parentForm = input.required<FormGroup>();
  private paginator!: MatPaginator;
  @ViewChild(MatPaginator, { static: false }) set matPaginator(mp: MatPaginator) {
    this.paginator = mp;
    this.dataSource.paginator = this.paginator;
  }
  readonly action = output<TnkAction>();
  dataSource = new MatTableDataSource();
  displayedColumns = ['action', 'gcode', 'gtext', 'size', 'color', 'unit', 'gskbn', 'jan', 'weight', 'tkbn', 'max', 'send', 'ordering', 'koguchi', 'lot', 'vgcode', 'hgcode'];
  hidx = 6; //tabindex用ヘッダ項目数
  mcols = 11; //tabindex用明細列数 
  scode!: string;

  ngOnInit(): void {
    this.addRows(1);
    this.refresh();
    this.strsrv.getStore();
    // this.dataSource.paginator = this.paginator;
  }

  delRow(row: number) {
    this.frmArr.removeAt(row);
    this.action.emit({ flg: false, row: row });//mstgoods.componentのメソッドins_throwに渡す引数
    this.refresh();
  }
  insRow(flgCP: boolean, row: number) {
    if (flgCP) {
      this.frmArr.insert(row, this.createRow(false, this.frmArr.controls[row - 1].value));
    } else {
      this.frmArr.insert(row, this.createRow(false));
    }
    this.action.emit({ flg: true, row: row, flgCP: flgCP });//mstgoods.componentのメソッドins_throwに渡す引数
    this.parentForm().markAsDirty();
    this.refresh();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    // console.log(this.usrsrv);
    this.usrsrv.getStaff(this.usrsrv.userInfo['email']).then(result => {
      this.scode = result?.scode ?? '';
    });
  }

  addRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.frmArr.push(this.createRow(false));
    }
    this.refresh();
  }
  getGzai(gcd: string): string {
    // console.log(gcd);
    let tooltip: string = "";
    const i: number = this.gdssrv.goods.findIndex(obj => obj.gcode == gcd);
    if (i > -1) {
      this.gdssrv.goods[i].msgzais.forEach(e => {
        tooltip += e.zcode + '_'.repeat(25 - e.zcode.length) + e.irisu + '\n';
      });
    }

    return tooltip;
  }
  async setJan(i: number) {
    rowCtl<RowField>(this.frmArr.controls[i]).jan.setValue(this.usrsrv.addCheckDigit(await this.usrsrv.getNumber('jan', 1)));
  }
  diaGzai(i: number) {
    let dialogConfig = new MatDialogConfig();
    const gcd: string = this.frmArr.controls[i].value.gcode;
    dialogConfig.data = {
      gcode: gcd
    };
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GzaiComponent, dialogConfig);
  }

  get frmArr(): FormArray {
    return this.parentForm().get('mtbl') as FormArray;
  }

  frmVal(i: number, fld: string): string {
    return this.frmArr.getRawValue()[i][fld];
  }
  gcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      gcode: this.frmArr.controls[i].value.hgcode
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          rowCtl<RowField>(this.frmArr.controls[i]).hgcode.setValue(data.gcode);
        }
      }
    );
  }



  updGds(i: number, event: Event) {
    let val: string = this.usrsrv.convUpper((event.target as HTMLInputElement)?.value);  //小文字全角→大文字半角変換
    rowCtl<RowField>(this.frmArr.controls[i]).gcode.setErrors(null);
    rowCtl<RowField>(this.frmArr.controls[i]).gcode.setValue(val);
    this.apollo.watchQuery<GoodsCheckResult>({
      query: Query.GetMast2,
      variables: {
        id: this.usrsrv.compid,
        grpcd: this.gdssrv.grpcd,
        gcode: val
      },
    }).valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        if (!data) {
          return;
        }
        const result = data as GoodsCheckResult;
        if (result.msgoods.length == 0) {
          let j: number = 0;
          this.frmArr.controls
            .forEach(control => {
              if (rowCtl<RowField>(control).gcode.value == val && j != i) {

                this.usrsrv.toastErr(val + 'は重複しています(' + (j + 1) + '行目)', '商品コード入力エラー');
                rowCtl<RowField>(this.frmArr.controls[i]).gcode.setErrors({ 'exist': true });
              }
              j += 1;
            });
        } else {
          this.usrsrv.toastErr(val + 'は商品ｸﾞﾙｰﾌﾟ' + result.msgoods[0].msggroup.code + 'で登録済です', '商品コード入力エラー');
          rowCtl<RowField>(this.frmArr.controls[i]).gcode.setErrors({ 'exist': true });
        }
      });
    rowCtl<RowField>((this.parentForm().get('mtbl2') as FormArray).controls[i]).gcode.setValue(val);
  }
  createRow(flg: boolean, goods?: mwI.Goods) {
    return this.fb.group({
      ins: [flg],
      gcode: [{ value: goods?.gcode, disabled: flg }],
      gtext: [goods?.gtext],
      size: [goods?.size],
      color: [goods?.color],
      pable: null,
      unit: [goods?.unit],
      gskbn: [goods?.gskbn],
      jan: [goods?.jan],
      weight: [goods?.weight],
      tkbn: [goods?.tkbn ?? '0'],
      // zkbn:[goods?.zkbn ?? '0'],
      max: [goods?.max],
      send: [goods?.send],
      ordering: [goods?.ordering],
      koguchi: [goods?.koguchi],
      lot: [goods?.lot],
      vgcode: [goods?.vgcode],
      hgcode: [goods?.hgcode]
    });
  }

  setGoods() {
    this.frmArr.clear();
    this.gdssrv.goods.forEach(e => {
      this.frmArr.push(this.createRow(true, e));
    });
    this.refresh();
  }

  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data = this.frmArr.controls;
  }

  getIdx(index: number) {
    if (this.paginator) {
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else {
      return index;
    }
  }

  setBgcolor(tkbn: string): string {
    let color: string;
    if (tkbn == '9') {
      color = 'lightgray';
    } else {
      color = 'transparent';
    }
    return color;
  }

  setPables() {
    if (this.displayedColumns.indexOf('pable') == -1) {
      this.displayedColumns.splice(5, 0, 'pable');
    }
    this.frmArr.controls.forEach(control => {
      const i: number = this.frmArr.controls.indexOf(control);
      // console.log(this.gdssrv.goods[i].msgzais,this.gdssrv.goods[i]);
      this.getPable(i, control.value.gcode, this.gdssrv.goods[i].msgzais);
    });
  }

  getPable(i: number, gcd: string, msgzais: GzaiRef[]) {
    // console.log(this.frmArr.controls[i].value,i);
    if (this.frmArr.controls[i].value.gskbn == "0") {
      // console.log(this.scode);
      this.stcsrv.getStock(gcd, this.frmArr.controls[i].value.gskbn, this.scode).then(result => {
        this.frmArr.controls[i].patchValue({ pable: ((result[0]?.stock - result[0]?.hikat - result[0]?.keepd) || 0) });
        this.refresh();
      });
    } else if (this.frmArr.controls[i].value.gskbn == "1") {
      this.stcsrv.getSetZai(this.scode, msgzais).then(result => {
        // console.log(result);
        this.frmArr.controls[i].patchValue({ pable: this.stcsrv.getPaabl(result) });
        this.refresh();
      });
    }
  }




}