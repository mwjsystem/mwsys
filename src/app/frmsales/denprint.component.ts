import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ShipService } from './../frmship/ship.service';
import { PdfService } from './../services/pdf.service';
import { DenPdfService } from './den-pdf.service';
import { DAY_LABELS, DayLabel, DEN_PRINT_FORMS, DenPrintForm, findPrintForm, KIND_NAMES } from './den-forms';

export interface DenprintData {
  denno: number;
  /** 受注伝票の納品書タイプ（最初に選ぶ帳票） */
  buntype: string | null;
}

/** 受注伝票の帳票（No.33）を選んで PDF を出す */
@Component({
  selector: 'app-denprint',
  template: `
    <h2 mat-dialog-title>帳票（伝票番号 {{data.denno}}）</h2>
    <mat-dialog-content>
      <div class="row">
        <label>帳票</label>
        <select [value]="form.code" (change)="pick($any($event.target).value)">
          @for (g of groups; track g.kind) {
            <optgroup [label]="g.name">
              @for (f of g.forms; track f.code) {
                <option [value]="f.code" [selected]="f.code == form.code">{{f.code}} {{f.name}}</option>
              }
            </optgroup>
          }
        </select>
      </div>
      <div class="row">
        <label>日付の見出し</label>
        <select (change)="dayLabel = $any($event.target).value">
          @for (l of dayLabels; track l) {
            <option [value]="l" [selected]="l == dayLabel">{{l}}</option>
          }
        </select>
      </div>
      @if (form.askAte) {
        <div class="row">
          <label>宛先</label>
          <input [value]="ate" (input)="ate = $any($event.target).value" maxlength="30" placeholder="空なら手書き用の空白">
        </div>
        <div class="hint">タイトル：{{preview()}}</div>
      }
      @if (form.kind == 'furikomi') {
        <div class="hint">専用の払込取扱票に印刷します。初めて使うときは、白い紙に印刷して用紙と重ね、位置を確かめてください。</div>
      }
      @if (error) {
        <div class="err">{{error}}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">閉じる</button>
      <button mat-stroked-button type="button" (click)="run(false)" [disabled]="busy"><mat-icon>download</mat-icon>保存</button>
      <button mat-flat-button color="primary" type="button" (click)="run(true)" [disabled]="busy"><mat-icon>print</mat-icon>開く（印刷）</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .row label { width: 7em; }
    .row select, .row input { font-size: 15px; padding: 3px; min-width: 18em; }
    .hint { font-size: 12px; color: #555555; margin: 4px 0 4px 7em; }
    .err { color: #c62828; margin-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class DenprintComponent {
  data = inject<DenprintData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<DenprintComponent>);
  private shipsrv = inject(ShipService);
  private densrv = inject(DenPdfService);
  private pdfsrv = inject(PdfService);
  private cdRef = inject(ChangeDetectorRef);

  readonly dayLabels = DAY_LABELS;
  readonly groups = (['money', 'work', 'order', 'furikomi'] as DenPrintForm['kind'][]).map(kind => ({
    kind, name: KIND_NAMES[kind], forms: DEN_PRINT_FORMS.filter(f => f.kind == kind)
  }));
  form: DenPrintForm = findPrintForm(this.data.buntype) ?? DEN_PRINT_FORMS.find(f => f.code == 12)!;
  dayLabel: DayLabel = this.form.dayLabel;
  ate = '';
  busy = false;
  error = '';

  pick(code: string) {
    this.form = DEN_PRINT_FORMS.find(f => f.code == Number(code)) ?? this.form;
    this.dayLabel = this.form.dayLabel;
  }

  preview(): string {
    return this.form.title.replace('{ate}', this.ate.trim() || '（空白）');
  }

  /** PDF を作る（open = 新しいタブで開く。false はファイルに保存） */
  async run(open: boolean) {
    // ポップアップを止められないように、押したときにタブを開いておく
    const win = open ? window.open('', '_blank') : null;
    this.busy = true;
    this.error = '';
    try {
      const [d] = await this.shipsrv.load([this.data.denno]);
      if (!d) {
        throw new Error('受注伝票 ' + this.data.denno + ' を読めませんでした');
      }
      const blob = await this.densrv.make(d, { form: this.form, dayLabel: this.dayLabel, ate: this.ate });
      const name = this.form.name + '_' + this.data.denno + '.pdf';
      if (win) {
        win.location.href = URL.createObjectURL(blob);
      } else {
        this.pdfsrv.download(blob, name);
      }
    } catch (e) {
      win?.close();
      this.error = '帳票を作れませんでした：' + (e as Error).message;
      console.log('error denprint', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
