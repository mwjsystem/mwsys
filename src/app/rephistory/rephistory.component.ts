import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import * as FileSaver from 'file-saver';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { UserService } from './../services/user.service';
import { HIST_LIMIT, HistOrder, RephistoryService } from './rephistory.service';
import { fillHistBook } from './rephistory-excel';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { DecimalPipe } from '@angular/common';
import { McdtxtPipe } from '../core/pipes/mcdtxt.pipe';

/**
 * 受注履歴（現行の「LST-HIST.xlsm」の置き換え）。受注先・商品・受付日の範囲で受注を探し、画面に出して Excel に落とす。
 * 商品を指定すると、その商品を含む受注の全明細を出す（該当の明細に色を付ける）。
 */
@Component({
    selector: 'app-rephistory',
    templateUrl: './rephistory.component.html',
    styleUrls: ['./rephistory.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatToolbar, MatButton, MatIconButton, MatIcon, FormsModule, MatFormField, MatLabel, MatInput, MatSuffix, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, DecimalPipe, McdtxtPipe]
})
export class RephistoryComponent {
  usrsrv = inject(UserService);
  private srv = inject(RephistoryService);
  private title = inject(Title);
  private dialog = inject(MatDialog);
  private cdRef = inject(ChangeDetectorRef);

  mcode = '';
  gcode = '';
  from: Date = this.yearAgo();
  to: Date = new Date();
  busy = false;
  error = '';
  /** 検索結果と、その検索の条件 */
  orders?: HistOrder[];
  over = false;
  private shown = { mcode: '', gcode: '', from: '', to: '' };
  private open = new Set<number>();
  limit = HIST_LIMIT;

  constructor() {
    this.title.setTitle('受注履歴(MWSystem)');
  }

  private yearAgo(): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }

  private ymd(d: Date): string {
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  /** 検索した商品（画面の列・メッセージ用） */
  get byGoods(): boolean {
    return !!this.shown.gcode;
  }

  /** 検索した商品の名称 */
  get goodsName(): string {
    return this.orders?.[0]?.lines.find(l => l.hit)?.gtext ?? '';
  }

  get lineCount(): number {
    return (this.orders ?? []).reduce((s, o) => s + o.lines.length, 0);
  }

  async search() {
    this.error = '';
    const mcode = (this.mcode ?? '').trim();
    const gcode = this.usrsrv.convUpper((this.gcode ?? '').trim());
    this.gcode = gcode;
    if (!mcode && !gcode) {
      this.error = '受注先か商品のどちらかを入力してください';
      return;
    }
    if (!this.from || !this.to || new Date(this.from) > new Date(this.to)) {
      this.error = '受付日の範囲を確認してください';
      return;
    }
    const from = new Date(this.from);
    const to = new Date(this.to);
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const res = await this.srv.search({ mcode, gcode, from, to });
      this.orders = res.orders;
      this.over = res.over;
      this.shown = { mcode, gcode, from: this.ymd(from), to: this.ymd(to) };
      this.open.clear();
    } catch (e) {
      this.orders = undefined;
      this.error = '検索できませんでした：' + (e as Error).message;
      console.log('error rephistory', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  isOpen(o: HistOrder): boolean {
    return this.open.has(o.head.denno);
  }

  toggle(o: HistOrder) {
    if (this.open.has(o.head.denno)) {
      this.open.delete(o.head.denno);
    } else {
      this.open.add(o.head.denno);
    }
  }

  /** すべて開く・閉じる */
  expand(all: boolean) {
    this.open.clear();
    if (all) {
      this.orders?.forEach(o => this.open.add(o.head.denno));
    }
  }

  async excel() {
    if (!this.orders) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const s = this.shown;
      const cond = [s.mcode ? '受注先 ' + s.mcode : '', s.gcode ? '商品 ' + s.gcode : '', '受付日 ' + s.from + '〜' + s.to].filter(e => e).join('　');
      // ExcelJS は大きいので、押されたときに読み込む
      const lib = await import('exceljs');
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      fillHistBook(wb, this.orders, '受注履歴（' + cond + '）', window.location.origin, this.byGoods);
      const buf = await wb.xlsx.writeBuffer();
      const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const key = [s.mcode, s.gcode].filter(e => e).join('_').replace(/[\\/:*?"<>|]/g, '_');
      FileSaver.saveAs(new Blob([buf], { type }), '受注履歴_' + key + '.xlsx');
    } catch (e) {
      this.error = 'Excel を作成できませんでした：' + (e as Error).message;
      console.log('error rephistory excel', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 受注伝票を別タブで開く */
  openDen(o: HistOrder) {
    this.usrsrv.openMst('frmsales', String(o.head.denno));
  }

  mcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.mcode = data.mcode;
          this.cdRef.detectChanges();
        }
      }
    );
  }

  gcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      gcode: this.gcode,
      tkbn: ['0', '1']
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.gcode = data.gcode;
          this.cdRef.detectChanges();
        }
      }
    );
  }
}
