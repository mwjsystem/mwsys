import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TkdService, TKD_MCODE } from './tkd.service';
import { TkdLine, TkdOrder, cellText, parseTkd, monthEnd, totalDiff } from './tkd-parse';
import { lineMoney } from './../frmamazon/amazon-parse';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { DenlinkComponent } from './../share/denlink/denlink.component';

/**
 * TKD（東海堂 Ｙ）請求の取込（現行の TH_TKD伝票登録03.xlsm の置き換え）。
 * 請求の Excel（TKD請求yyyymm.xlsx）をそのまま読み込み、日付ごとに確認してから受注伝票（売上のみ）に登録する。
 */
@Component({
  selector: 'app-frmtkd',
  templateUrl: './frmtkd.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, DecimalPipe, DenlinkComponent]
})
export class FrmtkdComponent {
  private srv = inject(TkdService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly mcode = TKD_MCODE;
  fileName = '';
  orders: TkdOrder[] = [];
  busy = false;
  error = '';
  message = '';
  progress = '';
  private open = new Set<string>();

  constructor() {
    this.title.setTitle('TKD請求取込(MWSystem)');
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  get lineCount(): number {
    return this.orders.reduce((s, o) => s + o.lines.length, 0);
  }

  /** 売上日（受注日の月末）。月が複数あれば、すべて並べる */
  get udays(): string {
    return [...new Set(this.orders.map(o => monthEnd(o.day)))].join('・');
  }

  /** 明細の税抜合計 */
  amount(o: TkdOrder): number {
    return o.lines.reduce((s, l) => s + lineMoney(l.price, l.qty, l.taxrate).money, 0);
  }

  get grand(): number {
    return this.orders.reduce((s, o) => s + this.amount(o), 0);
  }

  diff(l: TkdLine): boolean {
    return totalDiff(l);
  }

  diffCount(o: TkdOrder): number {
    return o.lines.filter(l => totalDiff(l)).length;
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.orders = [];
    this.open.clear();
    this.cdRef.detectChanges();
    try {
      const lib = await import('exceljs');
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      // 見出し（品番・数量）のあるシートを使う（ふつうは 1 枚目）
      const sheets = wb.worksheets.map(ws => {
        const rows: unknown[][] = [];
        ws.eachRow({ includeEmpty: true }, (row, no) => {
          const vals = row.values as unknown[];
          rows[no - 1] = Array.isArray(vals) ? vals.slice(1) : [];
        });
        return rows;
      });
      const rows = sheets.find(rs => rs.some(r => (r ?? []).some(c => cellText(c) == '品番'))) ?? sheets[0] ?? [];
      const orders = parseTkd(rows);
      if (orders.length == 0) {
        throw new Error('Excel に明細がありません');
      }
      await this.srv.resolve(orders);
      this.orders = orders;
      this.fileName = file.name;
    } catch (e) {
      this.error = 'Excel を読み込めませんでした：' + (e as Error).message;
      console.log('error frmtkd excel', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  isOpen(o: TkdOrder): boolean {
    return this.open.has(o.day);
  }

  toggle(o: TkdOrder) {
    if (this.open.has(o.day)) {
      this.open.delete(o.day);
    } else {
      this.open.add(o.day);
    }
  }

  private target(o: TkdOrder): boolean {
    return !o.err && !o.result.startsWith('登録済') && !o.result.startsWith('スキップ');
  }

  get targetCount(): number {
    return this.orders.filter(o => this.target(o)).length;
  }

  async register() {
    const list = this.orders.filter(o => this.target(o));
    if (list.length == 0 || !confirm('接続先：' + this.envName + '\n\n東海堂 Ｙ の請求 ' + list.length + ' 件（売上日 ' + this.udays + '）を登録します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    let ok = 0, skip = 0, ng = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      this.progress = '登録中 ' + (i + 1) + ' / ' + list.length + '  ' + o.dmemo;
      this.cdRef.detectChanges();
      try {
        o.result = await this.srv.register(o);
        if (o.result.startsWith('登録済')) {
          ok++;
        } else {
          skip++;
        }
      } catch (e) {
        o.result = 'エラー：' + (e as Error).message;
        ng++;
        console.log('error frmtkd register', o.day, e);
      }
    }
    this.progress = '';
    this.message = '登録 ' + ok + ' 件、スキップ ' + skip + ' 件、エラー ' + ng + ' 件';
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
