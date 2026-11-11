import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { PdfService } from './../services/pdf.service';
import { ShipService } from './../frmship/ship.service';
import { HatDoc, HatPdfService, HatShipAdr } from './hat-pdf.service';
import { HAT_PRINT_FORMS, HAT_SHIP_TO, HatPrintForm, HatShipTo } from './hat-forms';

export interface HatprintData {
  denno: number;
}

/**
 * 発注伝票の帳票（発注書など）。様式と発送先を選び、PDF を開く（印刷）・保存する
 */
@Component({
  selector: 'app-hatprint',
  template: `
    <h2 mat-dialog-title>帳票（発注伝票 {{data.denno}}）</h2>
    <mat-dialog-content>
      <div class="row">
        <label>帳票</label>
        <select (change)="pick($any($event.target).value)">
          @for (f of forms; track f.code) {
            <option [value]="f.code" [selected]="f.code == form.code">{{f.code}} {{f.name}}</option>
          }
        </select>
      </div>
      @if (!form.po) {
        <div class="row">
          <label>発送先</label>
          <select (change)="shipTo = $any($event.target).value">
            @for (t of shipTos; track t.value) {
              <option [value]="t.value" [selected]="t.value == shipTo" [disabled]="t.value == 'nsaki' && !jdenno">{{t.name}}</option>
            }
          </select>
        </div>
        @if (shipTo == 'nsaki') {
          <div class="hint">受注伝票 {{jdenno}} の納品先を発送先にします（お客様へ直送）。</div>
        }
        @if (!jdenno) {
          <div class="hint">受注伝票から作った発注ではないので、直送の発送先は選べません。</div>
        }
      }
      @if (form.fromStore) {
        <div class="hint">差出人を発注伝票の倉庫にし、「納期等のReFAXは倉庫まで」と入れます。</div>
      }
      @if (form.po) {
        <div class="hint">英文の Purchase Order（A4 横）です。品名は発注明細の商品名、Remarks は明細備考です。</div>
      }
      @if (error) {
        <div class="err">{{error}}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">閉じる</button>
      <button mat-stroked-button type="button" (click)="run('save')" [disabled]="busy"><mat-icon>download</mat-icon>保存</button>
      <button mat-flat-button color="primary" type="button" (click)="run('open')" [disabled]="busy"><mat-icon>print</mat-icon>開く（印刷）</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .row label { width: 6em; }
    .row select { font-size: 15px; padding: 3px; min-width: 22em; }
    .hint { font-size: 12px; color: #555555; margin: 4px 0 4px 6em; }
    .err { color: #c62828; margin-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class HatprintComponent {
  data = inject<HatprintData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<HatprintComponent>);
  private hpdfsrv = inject(HatPdfService);
  private pdfsrv = inject(PdfService);
  private shipsrv = inject(ShipService);
  private cdRef = inject(ChangeDetectorRef);

  readonly forms = HAT_PRINT_FORMS;
  readonly shipTos = HAT_SHIP_TO;
  form: HatPrintForm = HAT_PRINT_FORMS[0];
  shipTo: HatShipTo = 'store';
  busy = false;
  error = '';
  private doc?: HatDoc;
  /** 明細の受注伝票番号（1 つだけのとき、直送の発送先に使える） */
  jdenno = 0;

  constructor() {
    this.hpdfsrv.load(this.data.denno).then(d => {
      this.doc = d;
      this.jdenno = d.jdennos.length == 1 ? d.jdennos[0] : 0;
      this.cdRef.detectChanges();
    }).catch(e => {
      this.error = '発注伝票を読めませんでした：' + (e as Error).message;
      this.cdRef.detectChanges();
    });
  }

  pick(code: string) {
    this.form = HAT_PRINT_FORMS.find(f => f.code == Number(code)) ?? this.form;
    this.error = '';
  }

  /** 選んだ発送先の住所 */
  private async shipAdr(d: HatDoc): Promise<HatShipAdr | null> {
    switch (this.shipTo) {
      case 'store':
        return d.store;
      case 'nsaki': {
        const [j] = await this.shipsrv.load([this.jdenno]);
        if (!j) {
          throw new Error('受注伝票 ' + this.jdenno + ' を読めませんでした');
        }
        const a = j.nsaki.adr;
        return {
          name: j.nsaki.name, code: j.ncode ?? '', tel: a?.tel ?? '', fax: '', zip: a?.zip ?? '',
          adr: [a?.region, a?.local, a?.street, a?.extend, a?.extend2].filter(e => e).join('')
        };
      }
      default:
        return null;
    }
  }

  /** open = 新しいタブで開く、save = ファイルに保存 */
  async run(to: 'open' | 'save') {
    // ポップアップを止められないように、押したときにタブを開いておく
    const win = to == 'open' ? window.open('', '_blank') : null;
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const d = this.doc ?? await this.hpdfsrv.load(this.data.denno);
      this.doc = d;
      const blob = await this.hpdfsrv.make(d, this.form, this.form.po ? null : await this.shipAdr(d));
      if (win) {
        win.location.href = URL.createObjectURL(blob);
      } else {
        this.pdfsrv.download(blob, this.form.name + '_' + this.data.denno + '.pdf');
      }
    } catch (e) {
      win?.close();
      this.error = '帳票を作れませんでした：' + (e as Error).message;
      console.log('error hatprint', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
