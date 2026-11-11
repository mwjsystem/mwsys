import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { StaffService } from './../services/staff.service';
import { BunruiService } from './../services/bunrui.service';
import { ChoseiService, ChoRow } from './chosei.service';

/** 在庫調整伝票の検索（日付の範囲・倉庫・商品コード・理由）。行を押すと、その伝票番号を返す */
@Component({
  selector: 'app-chohelp',
  template: `
    <h2 mat-dialog-title>在庫調整伝票の検索</h2>
    <mat-dialog-content>
      <form class="cond" (ngSubmit)="find()">
        <label>日付 <input type="date" [(ngModel)]="from" name="from"> ～ <input type="date" [(ngModel)]="to" name="to"></label>
        <label>倉庫
          <select [(ngModel)]="scode" name="scode">
            <option value="">すべて</option>
            @for (s of strsrv.scds; track s.value) {
              <option [value]="s.value">{{s.viewval}}</option>
            }
          </select>
        </label>
        <label>理由
          <select [(ngModel)]="chokbn" name="chokbn">
            <option value="">すべて</option>
            @for (k of reasons; track k.value) {
              <option [value]="k.value">{{k.value}} {{k.viewval}}</option>
            }
          </select>
        </label>
        <label>商品コード <input [(ngModel)]="gcode" name="gcode" maxlength="20" style="width: 10em;"></label>
        <button mat-flat-button color="primary" type="submit" [disabled]="busy"><mat-icon>search</mat-icon>検索</button>
      </form>
      @if (error) {
        <div class="err">{{error}}</div>
      }
      @if (searched) {
        <div class="count">{{rows.length}} 件（行を押すと開きます。−は減らした数、＋は増やした数）</div>
      }
      <table class="tbl">
        <tr><th>伝票番号</th><th>日付</th><th>倉庫</th><th>担当者</th><th class="num">行</th><th>明細</th></tr>
        @for (r of rows; track r.denno) {
          <tr class="row" tabindex="0" (click)="ref.close(r.denno)" (keydown.enter)="ref.close(r.denno)">
            <td><b>{{r.denno}}</b></td><td>{{r.day}}</td><td>{{storeName(r.scode)}}</td><td>{{stfsrv.getName(r.tcode) || r.tcode}}</td>
            <td class="num">{{r.lines}}</td><td class="gds">{{r.text}}</td>
          </tr>
        }
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">閉じる</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cond { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 8px; }
    .cond input, .cond select { font-size: 14px; padding: 2px; }
    .count { font-size: 13px; color: #555555; margin: 4px 0; }
    .err { color: #c62828; }
    .tbl { border-collapse: collapse; width: 100%; font-size: 13px; }
    .tbl th, .tbl td { border-bottom: 1px solid #dddddd; padding: 4px 6px; text-align: left; }
    .tbl .num { text-align: right; }
    .tbl .gds { font-size: 12px; max-width: 34em; }
    .row { cursor: pointer; }
    .row:hover, .row:focus { background: #e3f2fd; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class ChohelpComponent {
  ref = inject(MatDialogRef<ChohelpComponent, number>);
  strsrv = inject(StoreService);
  stfsrv = inject(StaffService);
  private bunsrv = inject(BunruiService);
  private chosrv = inject(ChoseiService);
  private usrsrv = inject(UserService);
  private cdRef = inject(ChangeDetectorRef);

  from = '';
  to = '';
  scode = '';
  gcode = '';
  chokbn = '';
  rows: ChoRow[] = [];
  busy = false;
  searched = false;
  error = '';

  constructor() {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - 1);
    this.from = this.usrsrv.formatDate(from);
    this.to = this.usrsrv.formatDate(today);
    this.strsrv.getStore();
    this.find();
  }

  get reasons(): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn['hakikbn'] ?? []) as { value: string; viewval: string }[];
  }

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  async find() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      this.rows = await this.chosrv.search(this.from, this.to, this.scode, this.gcode, this.chokbn);
      this.searched = true;
    } catch (e) {
      this.error = '検索できませんでした：' + (e as Error).message;
      console.log('error chohelp', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
