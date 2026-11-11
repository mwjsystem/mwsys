import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './../services/pdf.service';
import { NasService } from './../services/nas.service';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { StaffService } from './../services/staff.service';
import { NAS_FAX } from './../share/nasfolder/nasfolder.component';
import { KUBUN_OUT, TenDen, TenLine, tenCheckUrl } from './tenkai.service';

export interface TenprintData {
  den: TenDen;
}

/** 作業 1 件（出庫の行の続きと、そのあとの入庫の行の続き） */
interface TenTask { no: number; outs: TenLine[]; ins: TenLine[] }

/** 明細を作業に分ける（出庫の行が続いたあとに入庫の行が続くまでを 1 件。現行の伝票の並びのまま） */
export function tenTasks(lines: TenLine[]): TenTask[] {
  const tasks: TenTask[] = [];
  let cur: TenTask | null = null;
  for (const l of lines.filter(e => e.gcode)) {
    if (l.kubun == KUBUN_OUT) {
      if (!cur || cur.ins.length > 0) {
        cur = { no: tasks.length + 1, outs: [], ins: [] };
        tasks.push(cur);
      }
      cur.outs.push(l);
    } else {
      if (!cur) {
        cur = { no: tasks.length + 1, outs: [], ins: [] };
        tasks.push(cur);
      }
      cur.ins.push(l);
    }
  }
  return tasks;
}

const grid = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: '#333333', vLineColor: '#333333',
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 3, paddingBottom: () => 3
};

/**
 * 展開指示書（新規。現行には無い）。倉庫の作業用に、展開伝票の明細を作業（使う商品 → 作る商品）ごとに並べる（A4 縦）。
 * PDF を開く（印刷）・保存する・倉庫宛 FAX フォルダ（担当者のフォルダ）に保存する
 */
@Component({
  selector: 'app-tenprint',
  template: `
    <h2 mat-dialog-title>展開指示書（展開伝票 {{data.den.denno}}）</h2>
    <mat-dialog-content>
      <div class="hint">倉庫の作業用です。明細を「使う商品（出庫）→ 作る商品（入庫）」の作業ごとに並べ、棚番・チェック欄・作業者と確認者の欄を付けます。</div>
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
    .hint { font-size: 13px; color: #555555; }
    .msg { color: #2e7d32; margin-top: 8px; font-weight: bold; }
    .err { color: #c62828; margin-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class TenprintComponent {
  data = inject<TenprintData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<TenprintComponent>);
  private pdfsrv = inject(PdfService);
  private nassrv = inject(NasService);
  private usrsrv = inject(UserService);
  private strsrv = inject(StoreService);
  private stfsrv = inject(StaffService);
  private apollo = inject(Apollo);
  private cdRef = inject(ChangeDetectorRef);

  busy = false;
  error = '';
  message = '';

  async run(to: 'open' | 'save' | 'fax') {
    const win = to == 'open' ? window.open('', '_blank') : null;
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      // NAS への書き込みの許可は、ボタンを押した処理の最初に求める
      const root = to == 'fax' ? await this.nassrv.open(NAS_FAX) : null;
      const d = this.data.den;
      const blob = await this.pdfsrv.createPdf(this.doc(d));
      const name = d.denno + '展開指示書.pdf';
      if (root) {
        const sei = await this.staffSei(d.tcode);
        if (!sei) {
          throw new Error('展開伝票の担当者が未設定です');
        }
        await this.nassrv.write(await this.nassrv.folder(root, sei), name, blob);
        this.message = '倉庫宛FAXフォルダに保存しました（' + sei + '/' + name + '）';
      } else if (win) {
        win.location.href = URL.createObjectURL(blob);
      } else {
        this.pdfsrv.download(blob, '展開指示書_' + d.denno + '.pdf');
      }
    } catch (e) {
      win?.close();
      this.error = (to == 'fax' ? '倉庫宛FAXフォルダに保存できませんでした：' : '指示書を作れませんでした：') + (e as Error).message;
      console.log('error tenprint', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 担当者の姓（倉庫宛 FAX フォルダの担当者のフォルダ名） */
  private async staffSei(tcode: string): Promise<string> {
    if (!tcode) {
      return '';
    }
    const Get = gql`query get_staffsei($id: smallint!, $code: String!) { msstaff(where: {id: {_eq: $id}, code: {_eq: $code}}) { sei } }`;
    const res = await firstValueFrom(this.apollo.query<{ msstaff: { sei: string | null }[] }>({
      query: Get, variables: { id: this.usrsrv.compid, code: tcode }
    }));
    return res.data?.msstaff[0]?.sei ?? '';
  }

  private doc(d: TenDen): TDocumentDefinitions {
    const store = this.strsrv.scds.find(s => s.value == d.scode)?.viewval ?? d.scode;
    const staff = this.stfsrv.getName(d.tcode) || d.tcode;
    const [y, m, dd] = d.day.split('-');
    const tasks = tenTasks(d.lines);
    const head: TableCell[] = ['作業', '', '棚番', '商品コード', '商品名', '数量', '単位', '備考', '済']
      .map(t => ({ text: t, fontSize: 8, alignment: 'center', fillColor: '#dddddd' }));
    const body: TableCell[][] = [];
    for (const t of tasks) {
      const rows = [...t.outs.map(l => ({ l, out: true })), ...t.ins.map(l => ({ l, out: false }))];
      rows.forEach((r, i) => {
        body.push([
          i == 0 ? { text: String(t.no), rowSpan: rows.length, fontSize: 14, bold: true, alignment: 'center', margin: [0, 4, 0, 0] } : '',
          { text: r.out ? '使う\n(出庫)' : '作る\n(入庫)', fontSize: 7, alignment: 'center', color: r.out ? '#bf360c' : '#0d47a1', fillColor: r.out ? '#fff3e0' : '#e3f2fd' },
          { text: r.l.tanano, fontSize: 10, bold: true },
          { text: r.l.gcode, fontSize: 11 },
          { text: r.l.gtext, fontSize: 9 },
          { text: String(r.l.suu), fontSize: 13, bold: true, alignment: 'right' },
          { text: r.l.unit, alignment: 'center' },
          { text: r.l.memo, fontSize: 8 },
          { text: '□', fontSize: 14, alignment: 'center' }
        ]);
      });
    }
    while (body.length < 14) {
      body.push(['', '', '', '', '', '', '', '', '']);
    }
    const outs = d.lines.filter(l => l.kubun == KUBUN_OUT).reduce((a, l) => a + Number(l.suu || 0), 0);
    const ins = d.lines.filter(l => l.kubun != KUBUN_OUT && l.gcode).reduce((a, l) => a + Number(l.suu || 0), 0);
    const signBox: Content = {
      table: {
        widths: [48, 48, 48],
        heights: [12, 38],
        body: [['担当者', '作業者', '確認者'].map(t => ({ text: t, fontSize: 8, alignment: 'center' })), [{ text: staff, fontSize: 8, alignment: 'center', margin: [0, 12, 0, 0] }, '', '']]
      },
      layout: grid
    };
    return {
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 28],
      info: { title: '展開指示書 ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      footer: (page: number, pages: number) => pages > 1 ? { text: page + ' / ' + pages, alignment: 'right', fontSize: 8, margin: [0, 4, 28, 0] } : { text: '' },
      content: [
        {
          columns: [
            {
              width: 150, stack: [
                { text: '展開依頼日：' + y + '年' + Number(m) + '月' + Number(dd) + '日', fontSize: 9 },
                { text: '倉庫：' + d.scode + ' ' + store, fontSize: 12, margin: [0, 4, 0, 4] },
                {
                  columns: [
                    { width: 72, stack: [{ qr: tenCheckUrl(d.denno), fit: 72, eccLevel: 'L' }] },
                    { width: '*', text: '作業が済んだら、スマホでこの QR を読んで「展開完了」を押してください', fontSize: 7, margin: [4, 6, 0, 0] }
                  ]
                }
              ]
            },
            { width: '*', stack: [{ text: '展　開　指　示　書', fontSize: 20, bold: true, alignment: 'center' }, { canvas: [{ type: 'line', x1: 10, y1: 2, x2: 190, y2: 2, lineWidth: 2 }] }] },
            { width: 170, stack: [{ text: '伝票NO：' + d.denno, fontSize: 12, alignment: 'right', margin: [0, 0, 0, 4] }, signBox] }
          ],
          columnGap: 10,
          margin: [0, 0, 0, 10]
        },
        {
          text: '「使う」の商品を棚から出し、「作る」の商品に作り替えて（詰め替えて）棚に入れてください。済んだら □ に印を付け、作業者の欄に記入し、左上の QR をスマホで読んで「展開完了」を押してください（「作る」の商品が在庫に入ります）。数量が足りないとき・合わないときは担当者に連絡してください。',
          fontSize: 9, margin: [0, 0, 0, 8]
        },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [28, 30, 46, 92, '*', 34, 26, 90, 18], body: [head, ...body] },
          layout: { ...grid, hLineWidth: (i: number) => i <= 1 ? 1.2 : 0.6 }
        },
        {
          margin: [0, 8, 0, 0],
          columns: [
            { width: '*', text: '作業 ' + tasks.length + ' 件　使う（出庫）計 ' + outs + '　作る（入庫）計 ' + ins, fontSize: 10 },
            { width: 10, text: '' },
            { width: 'auto', text: '展開完了日：' + (d.cday ? d.cday.replace(/-/g, '/') : '　　　　年　　月　　日'), fontSize: 10 }
          ]
        }
      ]
    };
  }
}
