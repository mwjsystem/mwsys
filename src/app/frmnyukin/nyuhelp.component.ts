import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { NOT_DEL, NyukinService, NyuRow } from './nyukin.service';

/** 入金伝票の検索（入金日の範囲・区分・請求先・受注伝票・請求伝票・取消を含む）。行を押すと伝票番号を返す */
@Component({
  selector: 'app-nyuhelp',
  template: `
    <h2 mat-dialog-title>入金伝票の検索</h2>
    <mat-dialog-content>
      <form class="cond" (ngSubmit)="find()">
        <label>入金日 <input type="date" [(ngModel)]="from" name="from"> ～ <input type="date" [(ngModel)]="to" name="to"></label>
        <label>区分
          <select [(ngModel)]="kubun" name="kubun">
            <option value="">すべて</option><option value="0">都度（受注）</option><option value="1">掛売（請求）</option>
          </select>
        </label>
        <label>請求先 <input [(ngModel)]="mcode" name="mcode" style="width: 7em;"></label>
        <label>受注伝票 <input [(ngModel)]="jdenno" name="jdenno" style="width: 7em;"></label>
        <label>請求伝票 <input [(ngModel)]="idenno" name="idenno" style="width: 7em;"></label>
        <label><input type="checkbox" [(ngModel)]="withDel" name="withDel"> 取消も出す</label>
        <button mat-flat-button color="primary" type="submit" [disabled]="busy"><mat-icon>search</mat-icon>検索</button>
      </form>
      @if (error) {<div class="err">{{error}}</div>}
      @if (searched) {<div class="count">{{rows.length}} 件（行を押すと開きます）</div>}
      <table class="tbl">
        <tr><th>伝票番号</th><th>区分</th><th>入金日</th><th>請求先</th><th>受注/請求</th><th class="num">入金</th><th class="num">出金</th><th class="num">調整</th><th>備考</th><th>担当</th></tr>
        @for (r of rows; track r.denno) {
          <tr class="row" [class.del]="r.del" tabindex="0" (click)="ref.close(r.denno)" (keydown.enter)="ref.close(r.denno)">
            <td><b>{{r.denno}}</b>@if (r.del) {<span class="delmark">取消</span>}</td>
            <td>{{r.kubun == 1 ? '掛売' : '都度'}}</td><td>{{r.day}}</td><td>{{r.mcode}}</td>
            <td>{{r.kubun == 1 ? (r.idenno ? '請求' + r.idenno : '') : (r.jdenno ? '受注' + r.jdenno : '')}}</td>
            <td class="num">{{r.nmoney | number}}</td><td class="num">{{r.smoney | number}}</td><td class="num">{{r.tmoney | number}}</td>
            <td class="memo">{{r.memo}}</td><td>{{stfsrv.getName(r.tcode) || r.tcode}}</td>
          </tr>
        }
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button type="button" (click)="ref.close()">閉じる</button></mat-dialog-actions>
  `,
  styles: [`
    .cond { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 8px; }
    .cond input, .cond select { font-size: 14px; padding: 2px; }
    .count { font-size: 13px; color: #555555; margin: 4px 0; }
    .err { color: #c62828; }
    .tbl { border-collapse: collapse; width: 100%; font-size: 13px; }
    .tbl th, .tbl td { border-bottom: 1px solid #dddddd; padding: 4px 6px; text-align: left; }
    .tbl .num { text-align: right; }
    .memo { font-size: 12px; max-width: 18em; }
    .row { cursor: pointer; }
    .row:hover, .row:focus { background: #e3f2fd; }
    .row.del td { color: #999999; text-decoration: line-through; }
    .delmark { margin-left: 4px; color: #c62828; font-size: 11px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon, DecimalPipe]
})
export class NyuhelpComponent {
  ref = inject(MatDialogRef<NyuhelpComponent, number>);
  stfsrv = inject(StaffService);
  private nyusrv = inject(NyukinService);
  private usrsrv = inject(UserService);
  private cdRef = inject(ChangeDetectorRef);

  from = '';
  to = '';
  kubun = '';
  mcode = '';
  jdenno = '';
  idenno = '';
  withDel = false;
  rows: NyuRow[] = [];
  busy = false;
  searched = false;
  error = '';

  constructor() {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - 1);
    this.from = this.usrsrv.formatDate(from);
    this.to = this.usrsrv.formatDate(today);
    this.find();
  }

  async find() {
    const w: object[] = [];
    if (this.from) {
      w.push({ day: { _gte: this.from } });
    }
    if (this.to) {
      w.push({ day: { _lte: this.to } });
    }
    if (this.kubun) {
      w.push({ kubun: { _eq: Number(this.kubun) } });
    }
    if (this.mcode.trim()) {
      w.push({ _or: [{ mcode: { _eq: this.mcode.trim() } }, { code: { _eq: this.mcode.trim() } }] });
    }
    if (Number(this.jdenno)) {
      w.push({ jdenno: { _eq: Number(this.jdenno) } });
    }
    if (Number(this.idenno)) {
      w.push({ idenno: { _eq: Number(this.idenno) } });
    }
    if (!this.withDel) {
      w.push(NOT_DEL);
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      this.rows = await this.nyusrv.slips(w);
      this.searched = true;
    } catch (e) {
      this.error = '検索できませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
