import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ShipService } from './../frmship/ship.service';
import type { ShipDoc } from './../frmship/ship-pdf.service';
import { PdfService } from './../services/pdf.service';
import { UserService } from './../services/user.service';
import { DenPdfService } from './den-pdf.service';
import { DAY_LABELS, DayLabel, DEN_PRINT_FORMS, DenPrintForm, findPrintForm, FormGroupKey, GROUP_NAMES, groupOf } from './den-forms';

export interface DenprintData {
  denno: number;
  /** 受注伝票の納品書タイプ（最初に選ぶ帳票） */
  buntype: string | null;
  /** 最初に選ぶ帳票の番号（納品書タイプより優先） */
  code?: number;
}

/** ダイアログを閉じたときの結果。'fax' は倉庫宛 FAX フォルダに保存した（キープ表・大会準備リストは受注ステータスが変わる） */
export type DenprintResult = 'fax' | undefined;

/**
 * 受注伝票の帳票（No.33）。帳票を選び、PDF を開く（印刷）・保存する・倉庫宛 FAX フォルダに保存する。
 * キープ表・大会準備リストは QR コード付きで、FAX フォルダに保存すると受注ステータスが「キープ表FAX済」になる
 * （倉庫のスマホで QR を読み、商品のバーコードを読んで確保数を入れる）。刺繍指示書は Excel を別のタブで作る
 */
@Component({
  selector: 'app-denprint',
  template: `
    <h2 mat-dialog-title>帳票（伝票番号 {{data.denno}}）</h2>
    <mat-dialog-content>
      <div class="row">
        <label>帳票</label>
        <select (change)="pick($any($event.target).value)">
          @for (g of groups; track g.key) {
            <optgroup [label]="g.name">
              @for (f of g.forms; track f.code) {
                <option [value]="f.code" [selected]="f.code == form.code">{{f.code < 900 ? f.code + ' ' : ''}}{{f.name}}</option>
              }
            </optgroup>
          }
        </select>
      </div>
      @if (form.kind != 'siji' && form.kind != 'keep') {
        <div class="row">
          <label>日付の見出し</label>
          <select (change)="dayLabel = $any($event.target).value">
            @for (l of dayLabels; track l) {
              <option [value]="l" [selected]="l == dayLabel">{{l}}</option>
            }
          </select>
        </div>
      }
      @if (form.askAte) {
        <div class="row">
          <label>宛先</label>
          <input [value]="ate" (input)="ate = $any($event.target).value" maxlength="30" placeholder="空なら手書き用の空白">
        </div>
        <div class="hint">タイトル：{{preview()}}</div>
      }
      @if (form.keep) {
        <div class="hint">QR コード付きです。「倉庫へFAX」で倉庫宛FAXフォルダに保存すると、受注ステータスが「キープ表FAX済」になります。倉庫ではスマホで QR を読み、商品のバーコードを読んで確保数を入れます。</div>
      }
      @if (form.kind == 'siji') {
        <div class="hint">帯の本数を刺繍指示書の Excel にセットします（別のタブで開きます）。</div>
      }
      @if (form.kind == 'furikomi') {
        <div class="hint">専用の払込取扱票に印刷します。初めて使うときは、白い紙に印刷して用紙と重ね、位置を確かめてください。</div>
      }
      @if (message) {
        <div class="msg">{{message}}</div>
      }
      @if (error) {
        <div class="err">{{error}}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(result)">閉じる</button>
      @if (form.kind == 'siji') {
        <button mat-flat-button color="primary" type="button" (click)="siji()"><mat-icon>content_cut</mat-icon>刺繍指示書を開く</button>
      } @else {
        <button mat-stroked-button type="button" (click)="run('save')" [disabled]="busy"><mat-icon>download</mat-icon>保存</button>
        @if (form.kind != 'furikomi') {
          <button mat-stroked-button color="accent" type="button" (click)="run('fax')" [disabled]="busy"
            title="NAS の倉庫宛FAXフォルダ（担当者のフォルダ）に PDF を保存します"><mat-icon>fax</mat-icon>倉庫へFAX</button>
        }
        <button mat-flat-button color="primary" type="button" (click)="run('open')" [disabled]="busy"><mat-icon>print</mat-icon>開く（印刷）</button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .row label { width: 7em; }
    .row select, .row input { font-size: 15px; padding: 3px; min-width: 20em; }
    .hint { font-size: 12px; color: #555555; margin: 4px 0 4px 7em; }
    .msg { color: #2e7d32; margin-top: 8px; font-weight: bold; }
    .err { color: #c62828; margin-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class DenprintComponent {
  data = inject<DenprintData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<DenprintComponent, DenprintResult>);
  private shipsrv = inject(ShipService);
  private densrv = inject(DenPdfService);
  private pdfsrv = inject(PdfService);
  private usrsrv = inject(UserService);
  private cdRef = inject(ChangeDetectorRef);

  readonly dayLabels = DAY_LABELS;
  readonly groups = (['money', 'work', 'keep', 'order', 'siji', 'furikomi'] as FormGroupKey[]).map(key => ({
    key, name: GROUP_NAMES[key], forms: DEN_PRINT_FORMS.filter(f => groupOf(f) == key)
  }));
  form: DenPrintForm = (this.data.code ? DEN_PRINT_FORMS.find(f => f.code == this.data.code) : undefined)
    ?? findPrintForm(this.data.buntype) ?? DEN_PRINT_FORMS.find(f => f.code == 12)!;
  dayLabel: DayLabel = this.form.dayLabel;
  ate = '';
  busy = false;
  error = '';
  message = '';
  result: DenprintResult;

  pick(code: string) {
    this.form = DEN_PRINT_FORMS.find(f => f.code == Number(code)) ?? this.form;
    this.dayLabel = this.form.dayLabel;
    this.message = '';
    this.error = '';
  }

  preview(): string {
    return this.form.title.replace('{ate}', this.ate.trim() || '（空白）');
  }

  /** 刺繍指示書（帯）を別のタブで開く */
  siji() {
    this.usrsrv.openMst('frmsiji', String(this.data.denno));
    this.ref.close(this.result);
  }

  private make(d: ShipDoc, qr?: string): Promise<Blob> {
    return this.densrv.make(d, { form: this.form, dayLabel: this.dayLabel, ate: this.ate, qr });
  }

  /** open = 新しいタブで開く、save = ファイルに保存、fax = 倉庫宛 FAX フォルダに保存 */
  async run(to: 'open' | 'save' | 'fax') {
    // ポップアップを止められないように、押したときにタブを開いておく
    const win = to == 'open' ? window.open('', '_blank') : null;
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      if (to == 'fax') {
        // NAS への書き込みの許可は、ボタンを押した処理の最初に求める（keepFax・faxPdf の中で最初に開く）
        const file = this.form.keep
          ? await this.shipsrv.keepFax(this.data.denno, this.form.name, (d, url) => this.make(d, url))
          : await this.shipsrv.faxPdf(this.data.denno, this.form.name, d => this.make(d));
        this.result = 'fax';
        this.message = '倉庫宛FAXフォルダに保存しました（' + file + '）' + (this.form.keep ? '。受注ステータスを「キープ表FAX済」にしました' : '');
      } else {
        const [d] = await this.shipsrv.load([this.data.denno]);
        if (!d) {
          throw new Error('受注伝票 ' + this.data.denno + ' を読めませんでした');
        }
        const blob = await this.make(d, this.form.keep ? this.shipsrv.keepUrl(this.data.denno) : undefined);
        if (win) {
          win.location.href = URL.createObjectURL(blob);
        } else {
          this.pdfsrv.download(blob, this.form.name + '_' + this.data.denno + '.pdf');
        }
      }
    } catch (e) {
      win?.close();
      this.error = (to == 'fax' ? '倉庫宛FAXフォルダに保存できませんでした：' : '帳票を作れませんでした：') + (e as Error).message;
      console.log('error denprint', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
