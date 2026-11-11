import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { PdfService } from './../services/pdf.service';
import { NasService } from './../services/nas.service';
import { NAS_FAX } from './../share/nasfolder/nasfolder.component';
import { MovePdfService, MOV_PRINT_FORMS, MovPrintForm } from './move-pdf.service';

export interface MovprintData {
  denno: number;
  /** 最初に選ぶ帳票の番号 */
  code?: number;
}

/**
 * 移動伝票の帳票（移動伝票・キープ伝票・本社引取・発送依頼・織マーク付け依頼・お渡し依頼・大会リスト）。
 * PDF を開く（印刷）・保存する・倉庫宛 FAX フォルダに保存する。移動伝票・大会リストは QR コード付き
 * （倉庫のスマホで QR を読み、商品の JAN を読んで数量を確かめ、移動伝票の数量を直す）
 */
@Component({
  selector: 'app-movprint',
  template: `
    <h2 mat-dialog-title>帳票（移動伝票 {{data.denno}}）</h2>
    <mat-dialog-content>
      <div class="row">
        <label>帳票</label>
        <select (change)="pick($any($event.target).value)">
          @for (f of forms; track f.code) {
            <option [value]="f.code" [selected]="f.code == form.code">{{f.code}} {{f.name}}</option>
          }
        </select>
      </div>
      @if (form.kind == 'irai') {
        <div class="row">
          <label>宛先</label>
          <input [value]="ate" (input)="ate = $any($event.target).value" maxlength="30" placeholder="空なら手書き用の空白">
        </div>
      }
      @if (form.qr) {
        <div class="hint">QR コード付きです。倉庫ではスマホで QR を読み、商品の JAN を読んで数を確かめると、移動伝票の数量を直せます（履歴は操作ログに残ります）。</div>
      }
      @if (message) {
        <div class="msg">{{message}}</div>
      }
      @if (error) {
        <div class="err">{{error}}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">閉じる</button>
      <button mat-stroked-button type="button" (click)="run('save')" [disabled]="busy"><mat-icon>download</mat-icon>保存</button>
      <button mat-stroked-button color="accent" type="button" (click)="run('fax')" [disabled]="busy"
        title="NAS の倉庫宛FAXフォルダ（担当者のフォルダ）に PDF を保存します"><mat-icon>fax</mat-icon>倉庫へFAX</button>
      <button mat-flat-button color="primary" type="button" (click)="run('open')" [disabled]="busy"><mat-icon>print</mat-icon>開く（印刷）</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .row label { width: 5em; }
    .row select, .row input { font-size: 15px; padding: 3px; min-width: 20em; }
    .hint { font-size: 12px; color: #555555; margin: 4px 0 4px 5em; }
    .msg { color: #2e7d32; margin-top: 8px; font-weight: bold; }
    .err { color: #c62828; margin-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class MovprintComponent {
  data = inject<MovprintData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<MovprintComponent>);
  private mpdfsrv = inject(MovePdfService);
  private pdfsrv = inject(PdfService);
  private nassrv = inject(NasService);
  private cdRef = inject(ChangeDetectorRef);

  readonly forms = MOV_PRINT_FORMS;
  form: MovPrintForm = MOV_PRINT_FORMS.find(f => f.code == this.data.code) ?? MOV_PRINT_FORMS[0];
  ate = this.form.ate ?? '';
  busy = false;
  error = '';
  message = '';

  pick(code: string) {
    this.form = MOV_PRINT_FORMS.find(f => f.code == Number(code)) ?? this.form;
    this.ate = this.form.ate ?? '';
    this.error = '';
    this.message = '';
  }

  /** open = 新しいタブで開く、save = ファイルに保存、fax = 倉庫宛 FAX フォルダ（担当者のフォルダ）に保存 */
  async run(to: 'open' | 'save' | 'fax') {
    // ポップアップを止められないように、押したときにタブを開いておく
    const win = to == 'open' ? window.open('', '_blank') : null;
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      // NAS への書き込みの許可は、ボタンを押した処理の最初に求める
      const root = to == 'fax' ? await this.nassrv.open(NAS_FAX) : null;
      const d = await this.mpdfsrv.load(this.data.denno);
      const blob = await this.mpdfsrv.make(d, this.form, this.ate);
      const name = d.denno + this.nassrv.safeName(this.form.name) + '.pdf';
      if (root) {
        if (!d.staffSei) {
          throw new Error('移動伝票の担当者が未設定です');
        }
        const dir = await this.nassrv.folder(root, d.staffSei);
        await this.nassrv.write(dir, name, blob);
        this.message = '倉庫宛FAXフォルダに保存しました（' + d.staffSei + '/' + name + '）';
      } else if (win) {
        win.location.href = URL.createObjectURL(blob);
      } else {
        this.pdfsrv.download(blob, this.form.name + '_' + this.data.denno + '.pdf');
      }
    } catch (e) {
      win?.close();
      this.error = (to == 'fax' ? '倉庫宛FAXフォルダに保存できませんでした：' : '帳票を作れませんでした：') + (e as Error).message;
      console.log('error movprint', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
