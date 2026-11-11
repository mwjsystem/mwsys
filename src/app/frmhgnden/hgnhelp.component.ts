import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { StaffService } from './../services/staff.service';
import { HgndenService, HgnRow } from './hgnden.service';

/** 発注外入荷伝票の検索（日付の範囲・倉庫・商品コード・備考）。行を押すと、その伝票番号を返す */
@Component({
  selector: 'app-hgnhelp',
  template: `
    <h2 mat-dialog-title>発注外入荷伝票の検索</h2>
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
        <label>商品コード <input [(ngModel)]="gcode" name="gcode" maxlength="20" style="width: 10em;"></label>
        <label>備考 <input [(ngModel)]="memo" name="memo" maxlength="50" style="width: 10em;"></label>
        <button mat-flat-button color="primary" type="submit" [disabled]="busy"><mat-icon>search</mat-icon>検索</button>
      </form>
      @if (error) {
        <div class="err">{{error}}</div>
      }
      @if (searched) {
        <div class="count">{{rows.length}} 件（行を押すと開きます）</div>
      }
      <table class="tbl">
        <tr><th>伝票番号</th><th>日付</th><th>倉庫</th><th>担当者</th><th class="num">行</th><th class="num">数量計</th><th>明細</th></tr>
        @for (r of rows; track r.denno) {
          <tr class="row" tabindex="0" (click)="ref.close(r.denno)" (keydown.enter)="ref.close(r.denno)">
            <td><b>{{r.denno}}</b></td><td>{{r.day}}</td><td>{{storeName(r.scode)}}</td><td>{{stfsrv.getName(r.tcode) || r.tcode}}</td>
            <td class="num">{{r.lines}}</td><td class="num">{{r.suu}}</td><td class="gds">{{r.text}}</td>
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
export class HgnhelpComponent {
  ref = inject(MatDialogRef<HgnhelpComponent, number>);
  strsrv = inject(StoreService);
  stfsrv = inject(StaffService);
  private hgnsrv = inject(HgndenService);
  private usrsrv = inject(UserService);
  private cdRef = inject(ChangeDetectorRef);

  from = '';
  to = '';
  scode = '';
  gcode = '';
  memo = '';
  rows: HgnRow[] = [];
  busy = false;
  searched = false;
  error = '';

  constructor() {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - 1);
    this.from = this.usrsrv.formatDate(from);
    this.to = this.usrsrv.formatDate(today);
    this.strsrv.getStore().then(() => this.cdRef.detectChanges());
    this.find();
  }

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  async find() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      this.rows = await this.hgnsrv.search(this.from, this.to, this.scode, this.gcode, this.memo);
      this.searched = true;
    } catch (e) {
      this.error = '検索できませんでした：' + (e as Error).message;
      console.log('error hgnhelp', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
