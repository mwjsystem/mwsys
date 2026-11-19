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
import { VendsService } from './../mstvendor/vends.service';
import { NAS_FAX } from './../share/nasfolder/nasfolder.component';
import { KAKO_KINDS, KakoDen, kakoCheckUrl } from './kako.service';
import { KakoFigure, kakoFigure, spotOf } from './kakofig';

export interface KakoprintData {
  den: KakoDen;
}

const grid = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: '#333333', vLineColor: '#333333',
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 3, paddingBottom: () => 3
};

const jpDay = (d: string) => {
  if (!d) {
    return '';
  }
  const [y, m, dd] = d.split('-');
  return y + '年' + Number(m) + '月' + Number(dd) + '日';
};

/**
 * 加工指示書（刺繍・プリント。A4 縦。今の道場ごとにばらばらの指示書を、まずこの形にそろえる）。
 * 加工先が倉庫のときは QR コードを付け、各拠点のスマホで状態を進められる。PDF を開く（印刷）・保存する・倉庫宛 FAX フォルダに保存する
 */
@Component({
  selector: 'app-kakoprint',
  template: `
    <h2 mat-dialog-title>加工指示書（加工指示 {{data.den.kno}}・連番 {{data.den.renban}}）</h2>
    <mat-dialog-content>
      <div class="hint">加工先・納期・商品・位置と内容・備考を 1 枚にまとめます。@if (data.den.dtype == 'S') {右上の QR を各拠点のスマホで読むと、状態を進められます。}</div>
      @if (message) {<div class="msg">{{message}}</div>}
      @if (error) {<div class="err">{{error}}</div>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">閉じる</button>
      <button mat-stroked-button type="button" (click)="run('save')" [disabled]="busy"><mat-icon>download</mat-icon>保存</button>
      <button mat-stroked-button color="accent" type="button" (click)="run('fax')" [disabled]="busy"
        title="NAS の倉庫宛FAXフォルダ（内勤のフォルダ）に PDF を保存します"><mat-icon>fax</mat-icon>倉庫へFAX</button>
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
export class KakoprintComponent {
  data = inject<KakoprintData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<KakoprintComponent>);
  private pdfsrv = inject(PdfService);
  private nassrv = inject(NasService);
  private usrsrv = inject(UserService);
  private strsrv = inject(StoreService);
  private stfsrv = inject(StaffService);
  private vensrv = inject(VendsService);
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
      if (this.vensrv.vends.length == 0) {
        await this.vensrv.getVendors();
      }
      const fig = await kakoFigure(d.posis, d.lines.map(l => l.gcode));
      const blob = await this.pdfsrv.createPdf(this.doc(d, fig));
      const name = d.kno + '加工指示書_' + d.renban + '_' + (d.mname || d.mcode).replace(/[\\/:*?"<>|\s]/g, '') + '.pdf';
      if (root) {
        const sei = await this.staffSei(d.tcode);
        if (!sei) {
          throw new Error('加工指示の内勤が未設定です');
        }
        await this.nassrv.write(await this.nassrv.folder(root, sei), name, blob);
        this.message = '倉庫宛FAXフォルダに保存しました（' + sei + '/' + name + '）';
      } else if (win) {
        win.location.href = URL.createObjectURL(blob);
      } else {
        this.pdfsrv.download(blob, name);
      }
    } catch (e) {
      win?.close();
      this.error = (to == 'fax' ? '倉庫宛FAXフォルダに保存できませんでした：' : '指示書を作れませんでした：') + (e as Error).message;
      console.log('error kakoprint', e);
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

  private destName(d: KakoDen): string {
    return d.dtype == 'V' ? (this.vensrv.getVcdtxt(d.dcode) || d.dcode) : (this.strsrv.scds.find(s => s.value == d.dcode)?.viewval ?? d.dcode);
  }

  private doc(d: KakoDen, fig: KakoFigure | null): TDocumentDefinitions {
    const kind = KAKO_KINDS.find(k => k.value == d.kind)?.name ?? '加工';
    const staff = this.stfsrv.getName(d.tcode) || d.tcode;
    const rs = d.rscode ? (this.strsrv.scds.find(s => s.value == d.rscode)?.viewval ?? d.rscode) : '';
    const due = d.wishday || d.planday;
    const th = (t: string): TableCell => ({ text: t, fontSize: 8, alignment: 'center', fillColor: '#dddddd' });

    // 商品
    const goods: TableCell[][] = d.lines.map(l => [
      { text: l.gcode, fontSize: 12, bold: true },
      { text: l.gtext, fontSize: 8 },
      { text: String(l.suu), fontSize: 13, bold: true, alignment: 'right' },
      { text: l.memo, fontSize: 8 }
    ]);
    // 図があるときは、空の行を減らして 1 枚に収める
    while (goods.length < (fig ? 3 : 6)) {
      goods.push(['', '', '', '']);
    }
    // 位置と内容（番号は図の札の番号。図に場所のない位置の刺繍の図は、表の右に小さく貼る）
    const posis: TableCell[][] = d.posis.map((p, i) => [
      { text: String(i + 1), fontSize: 11, bold: true, alignment: 'center', color: '#ffffff', fillColor: '#000000' },
      { text: p.posi, fontSize: 12, bold: true, alignment: 'center' },
      { text: p.naiyo, fontSize: 13 },
      { text: p.shotai, fontSize: 9 },
      { text: p.color, fontSize: 10 },
      { text: p.size, fontSize: 9 },
      { text: p.memo, fontSize: 8 },
      p.img && !spotOf(p.posi) ? { image: p.img, fit: [56, 34], alignment: 'center' } : ''
    ]);
    while (posis.length < (fig ? 3 : 7)) {
      posis.push(['', '', '', '', '', '', '', '']);
    }
    const info: TableCell[][] = [
      [th('受注伝票'), { text: String(d.jdenno ?? ''), fontSize: 11, bold: true }, th('依頼日'), { text: jpDay(d.reqday), fontSize: 10 }],
      [th('お客様'), { text: (d.mcode ? d.mcode + ' ' : '') + d.mname, fontSize: 10 }, th(d.wishday ? '希望納期' : '予定納期'), { text: jpDay(due), fontSize: 13, bold: true, color: '#c62828' }],
      [th('内勤'), { text: staff, fontSize: 10 }, th('納品場所'), { text: rs, fontSize: 12, bold: true }],
      [th('加工内容'), { text: d.naiyo, fontSize: 11, bold: true }, th('同梱'), { text: d.doukon ? '有' : '無', fontSize: 12, bold: true, alignment: 'center' }]
    ];
    const qr = d.dtype == 'S'
      ? { width: 76, stack: [{ qr: kakoCheckUrl(d.kno), fit: 76, eccLevel: 'L' }, { text: 'スマホで読んで\n状態を進める', fontSize: 6, alignment: 'center' }] }
      : { width: 0, text: '' };
    const stepBox: Content = {
      table: {
        widths: ['*', '*', '*', '*'],
        heights: [12, 26],
        body: [
          ['倉庫から発送', '加工先で受取', '加工済・発送', '倉庫で受取'].map(t => ({ text: t, fontSize: 8, alignment: 'center', fillColor: '#eeeeee' })),
          ['　月　日', '　月　日', '　月　日', '　月　日'].map(t => ({ text: t, fontSize: 9, alignment: 'center', margin: [0, 8, 0, 0] }))
        ]
      },
      layout: grid
    };
    return {
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 28],
      info: { title: kind + '指示書 ' + d.kno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      content: [
        {
          columns: [
            {
              width: '*', stack: [
                { text: this.destName(d) + '　御中', fontSize: 15, bold: true, decoration: 'underline', margin: [0, 0, 0, 4] },
                { text: kind + '　指　示　書', fontSize: 20, bold: true },
                { text: '加工指示 No.' + d.kno + (d.del ? '　【取消】' : ''), fontSize: 9, margin: [0, 4, 0, 0], color: d.del ? '#c62828' : '#000000' }
              ]
            },
            {
              width: 110, table: {
                widths: ['*'],
                body: [[{ text: '連番', fontSize: 8, alignment: 'center', fillColor: '#dddddd' }], [{ text: d.renban, fontSize: 24, bold: true, alignment: 'center' }]]
              }, layout: grid
            },
            qr as Content
          ],
          columnGap: 10,
          margin: [0, 0, 0, 8]
        },
        { table: { widths: [52, '*', 52, 120], body: info }, layout: grid, margin: [0, 0, 0, 8] },
        { text: '加工する商品', fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        {
          table: { headerRows: 1, widths: [110, '*', 34, 120], body: [[th('品番/号数'), th('商品名'), th('数'), th('備考')], ...goods] },
          layout: grid, margin: [0, 0, 0, 8]
        },
        ...(fig ? [{ image: fig.url, fit: [539, 215], alignment: 'center', margin: [0, 0, 0, 6] } as Content] : []),
        { text: '位置と内容', fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        {
          table: {
            headerRows: 1, widths: [16, 44, '*', 56, 52, 56, 70, 60],
            body: [[th('No'), th('位置'), th('文字・内容'), th('書体'), th('糸色'), th('サイズ'), th('備考'), th('刺繍の図')], ...posis]
          },
          layout: grid, margin: [0, 0, 0, 8]
        },
        {
          table: { widths: ['*'], heights: [fig ? 44 : 70], body:[[{ stack: [{ text: '備考', fontSize: 8, color: '#555555' }, { text: d.memo, fontSize: 11 }] }]] },
          layout: grid, margin: [0, 0, 0, 8]
        },
        stepBox,
        { text: '（株）マーシャルワールドジャパン　' + staff, alignment: 'right', fontSize: 9, margin: [0, 8, 0, 0] }
      ]
    };
  }
}
