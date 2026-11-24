import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { CdkScrollable } from '@angular/cdk/scrolling';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { StoreService } from './../../services/store.service';
import { StockService, StoreStock } from './../../services/stock.service';

/** 開くときに渡す商品 */
export interface StcscdsData { gcode: string; gtext: string; gskbn: string; unit: string }

/**
 * 全倉庫在庫数（No.26）。現在庫確認から開き、その商品の在庫・受注可能数を倉庫ごとに一覧にする。
 * 在庫も引当も無い倉庫は、「すべての倉庫を出す」のときだけ出す
 */
@Component({
    selector: 'app-stcscds',
    templateUrl: './stcscds.component.html',
    styleUrls: ['./../../help.component.scss', './stcscds.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButton, MatDialogTitle, CdkScrollable, CdkDrag, CdkDragHandle, MatDialogContent, MatDialogActions, MatProgressSpinner]
})
export class StcscdsComponent implements OnInit {
  private dialogRef = inject<MatDialogRef<StcscdsComponent>>(MatDialogRef);
  private strsrv = inject(StoreService);
  private stcsrv = inject(StockService);
  private cdRef = inject(ChangeDetectorRef);
  data = inject<StcscdsData>(MAT_DIALOG_DATA);

  rows: StoreStock[] = [];
  busy = true;
  error = '';
  showAll = false;

  get shown(): StoreStock[] {
    return this.showAll ? this.rows : this.rows.filter(r => r.stock || r.pable || r.hikat || r.keepd || r.kakod);
  }

  get total(): { stock: number; pable: number; hikat: number; keepd: number; kakod: number } {
    return this.rows.reduce((a, r) => ({
      stock: a.stock + (r.stock ?? 0), pable: a.pable + r.pable, hikat: a.hikat + r.hikat, keepd: a.keepd + r.keepd, kakod: a.kakod + r.kakod
    }), { stock: 0, pable: 0, hikat: 0, keepd: 0, kakod: 0 });
  }

  async ngOnInit() {
    try {
      await this.strsrv.getStore();
      this.rows = await this.stcsrv.byStore(this.data.gcode, this.data.gskbn, this.strsrv.scds);
    } catch (e) {
      this.error = '在庫を読めませんでした：' + (e as Error).message;
      console.log('error stcscds', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  toggleAll() {
    this.showAll = !this.showAll;
  }

  close() {
    this.dialogRef.close();
  }
}
