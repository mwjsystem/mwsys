import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ClosedayService } from './../services/closeday.service';

/**
 * 締め日設定（システム → 締め日設定）。システムマスタの締め日（closeday）を変える。
 * 締め日以前の売上日の受注伝票は、金額に関わる項目（明細の品番・数量・単価、行の追加・削除など）を変えられず、
 * 受注伝票の出荷日・売上日に締め日以前の日付を入れられない
 */
@Component({
  selector: 'app-mstclose',
  templateUrl: './mstclose.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon]
})
export class MstcloseComponent implements OnInit {
  private closesrv = inject(ClosedayService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  /** 保存してある締め日 */
  saved = '';
  /** 画面で入れた締め日 */
  day = '';
  editing = false;
  busy = false;
  error = '';
  message = '';

  constructor() {
    this.title.setTitle('締め日設定(MWSystem)');
  }

  async ngOnInit() {
    await this.load();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  private async load() {
    this.busy = true;
    this.saved = await this.closesrv.load(true);
    this.day = this.saved;
    this.error = this.closesrv.error ? '締め日を読めませんでした（システムマスタに締め日の列 closeday が無いか、権限がありません）：' + this.closesrv.error : '';
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 先月末（締め日の入れ方の例） */
  lastMonthEnd(): string {
    const d = new Date();
    const e = new Date(d.getFullYear(), d.getMonth(), 0);
    return e.getFullYear() + '-' + String(e.getMonth() + 1).padStart(2, '0') + '-' + String(e.getDate()).padStart(2, '0');
  }

  label(s: string): string {
    if (!s) {
      return '未設定（締めていません）';
    }
    const [y, m, d] = s.split('-').map(Number);
    return y + '年' + m + '月' + d + '日';
  }

  startEdit() {
    this.editing = true;
    this.message = '';
  }

  cancel() {
    this.day = this.saved;
    this.editing = false;
  }

  async save() {
    if (this.day == this.saved) {
      this.editing = false;
      return;
    }
    if (this.saved && this.day && this.day < this.saved
      && !confirm('締め日を前に戻します（' + this.label(this.saved) + ' → ' + this.label(this.day) + '）。\n戻した期間の伝票が変更できるようになります。よろしいですか？')) {
      return;
    }
    if (!confirm('接続先：' + this.envName + '\n\n締め日を ' + this.label(this.day) + ' にします。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      await this.closesrv.save(this.day);
      this.saved = this.day;
      this.editing = false;
      this.message = '締め日を ' + this.label(this.day) + ' にしました';
    } catch (e) {
      this.error = '保存できませんでした：' + (e as Error).message;
      console.log('error save closeday', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
