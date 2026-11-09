import { Injectable, inject } from '@angular/core';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './../services/pdf.service';
import { barcodeCanvas, codabar } from './../services/barcode';
import type { ShipAdr, ShipDoc, ShipLine } from './../frmship/ship-pdf.service';
import { DayLabel, DenPrintForm, FURIKOMI_ACCOUNT, WorkLine } from './den-forms';

/** 印刷のときに選んだこと */
export interface DenPrintOption {
  form: DenPrintForm;
  dayLabel: DayLabel;
  /** タイトルの {ate} に入れる宛先（空なら手書き用の空白） */
  ate: string;
}

const yen = (v: number | null | undefined): string => Number(v ?? 0).toLocaleString('ja-JP');
const jday = (day: string | null | undefined): string => {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.slice(0, 10).split('-');
  return y + '年' + Number(m) + '月' + String(Number(d)).padStart(2, ' ') + '日';
};
const sday = (day: string | null | undefined): string => {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.slice(0, 10).split('-');
  return y + '/' + String(Number(m)).padStart(2, ' ') + '/' + String(Number(d)).padStart(2, ' ');
};
const zipText = (z: string | null | undefined): string => z ? z.replace(/^(\d{3})(\d{4})$/, '$1-$2') : '';
/** 住所を行に分ける（都道府県・市区町村 / 番地 / 建物） */
const adrLines = (a?: ShipAdr): string[] => a
  ? [[a.region, a.local].filter(e => e).join(''), a.street ?? '', [a.extend, a.extend2].filter(e => e).join(' ')].filter(e => e)
  : [];
const lines = (s: string | null | undefined): string[] => (s ?? '').split(/\r?\n/).filter(e => e.trim());

/** 罫線の表 */
const grid = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: '#333333', vLineColor: '#333333',
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2
};
const box = (stack: Content[], width: number | string = '*', minHeight = 0): Content => ({
  table: { widths: [width], heights: minHeight ? [minHeight] : undefined, body: [[{ stack, margin: [6, 4, 6, 4] }]] },
  layout: grid
});

/**
 * 受注伝票の帳票（No.33）の PDF。様式は den-forms.ts の 4 種類（金額のある帳票・作業指示書・受注票・郵便振込用紙）
 */
@Injectable({
  providedIn: 'root'
})
export class DenPdfService {
  private pdfsrv = inject(PdfService);
  private stamp?: Promise<string | null>;

  async make(d: ShipDoc, opt: DenPrintOption): Promise<Blob> {
    let doc: TDocumentDefinitions;
    switch (opt.form.kind) {
      case 'money':
        doc = this.moneyDoc(d, opt, opt.form.invoice ? await this.stampImage() : null);
        break;
      case 'work':
        doc = this.workDoc(d, opt);
        break;
      case 'order':
        doc = this.orderDoc(d, opt);
        break;
      default:
        doc = this.furikomiDoc(d);
    }
    return this.pdfsrv.createPdf(doc);
  }

  /** 角印の画像（assets/stamp.png）。置いていなければ null（角印なしで出す） */
  private stampImage(): Promise<string | null> {
    if (!this.stamp) {
      this.stamp = (async () => {
        try {
          const res = await fetch('assets/stamp.png');
          if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
            return null;
          }
          const blob = await res.blob();
          return await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error);
            r.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      })();
    }
    return this.stamp;
  }

  /** 日付の見出しに合う日付 */
  private dayOf(d: ShipDoc, label: DayLabel): string | null | undefined {
    switch (label) {
      case '売上日': return d.uday;
      case '出荷日': return d.sday;
      case '出荷予定日': return d.yday;
      default: return d.day;
    }
  }

  /** タイトル（{ate} を宛先に。空なら手書き用の空白） */
  private titleOf(opt: DenPrintOption): string {
    return opt.form.title.replace('{ate}', opt.ate.trim() || '　'.repeat(8));
  }

  /** 送り状番号のバーコード（NW-7。番号に使えない文字があれば出さない） */
  private barcode(okurino: string | null): Content[] {
    const no = (okurino ?? '').trim();
    if (!no) {
      return [];
    }
    try {
      return [
        { text: no, alignment: 'right', fontSize: 8 },
        { columns: [{ width: '*', text: '' }, { width: 160, stack: [barcodeCanvas(codabar(no), 160, 26)] }] },
        { text: 'a ' + no.split('').join(' ') + ' a', alignment: 'right', fontSize: 7 }
      ];
    } catch {
      return [{ text: no, alignment: 'right', fontSize: 8 }];
    }
  }

  /** 担当・日付・伝票番号の表 */
  private infoTable(d: ShipDoc, opt: DenPrintOption, staff: boolean): Content {
    const head: TableCell[] = [];
    const body: TableCell[] = [];
    if (staff) {
      head.push({ text: '担　当', alignment: 'center' });
      body.push({ text: [d.tcode ?? '', d.staffName].filter(e => e).join('\n'), alignment: 'center', fontSize: 8 });
    }
    head.push({ text: opt.dayLabel.split('').join(' '), alignment: 'center' }, { text: '伝票番号', alignment: 'center' });
    body.push({ text: jday(this.dayOf(d, opt.dayLabel)), alignment: 'center', margin: [0, 4, 0, 4] }, { text: String(d.denno), alignment: 'center', margin: [0, 4, 0, 4] });
    return {
      table: { widths: staff ? [60, 90, 60] : [70, 80], body: [head, body] },
      layout: grid
    };
  }

  /** 明細の商品欄（商品名と、下に小さく明細備考） */
  private goodsCell(l: ShipLine): TableCell {
    const memo = (l.mmemo ?? '').trim();
    return { stack: [{ text: l.gtext ?? '' }, ...(memo ? [{ text: memo, fontSize: 7 }] : [])] };
  }

  // ===================== 金額のある帳票 =====================
  private moneyDoc(d: ShipDoc, opt: DenPrintOption, stamp: string | null): TDocumentDefinitions {
    const f = opt.form;
    const betsuno = !!f.betsuno;
    // 宛先の箱: 別納は納品先（お客様直送）、それ以外は受注先
    const to = betsuno ? d.nsaki : d.orderer;
    const toCode = betsuno ? '' : d.mcode;
    const toBox: Content[] = [
      ...(betsuno ? [{ text: '［お客様直送］', fontSize: 8, margin: [0, 0, 0, 2] } as Content] : []),
      box([
        { text: zipText(to.adr?.zip) },
        ...adrLines(to.adr).map(t => ({ text: t } as Content)),
        { text: ' ', margin: [0, 2, 0, 0] },
        { columns: [{ width: '*', text: to.name, fontSize: 12 }, { width: 30, text: '様', fontSize: 12, alignment: 'right' }] },
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 225, y2: 2, lineWidth: 0.6 }] },
        { text: toCode, margin: [20, 2, 0, 0] }
      ], 240, 96)
    ];
    const sys = d.system;
    const fromStack: Content[] = [
      ...(f.invoice && sys.invno ? [{ text: '登録番号：' + sys.invno, fontSize: 8 } as Content] : [{ text: ' ' } as Content]),
      { text: sys.kname ?? '', fontSize: 14 },
      { canvas: [{ type: 'line', x1: 0, y1: 1, x2: 250, y2: 1, lineWidth: 0.6 }] },
      { text: (sys.zip ? sys.zip + ' ' : '') + (sys.adr ?? ''), margin: [30, 4, 0, 0] },
      { text: 'TEL：' + (sys.tel ?? '') + '　　FAX：' + (sys.fax ?? ''), margin: [30, 6, 0, 6] },
      { columns: [{ width: '*', text: '' }, { width: 'auto', stack: [this.infoTable(d, opt, !!f.staff)] }] }
    ];
    const taxIn = !!f.taxIn;
    const head: TableCell[] = ['', '商品コード', '商品', '数量', '単位', '単価', '金額'].map(t => ({ text: t, bold: true, alignment: 'center' }));
    const body: TableCell[][] = d.lines.map(l => {
      const money = taxIn ? Number(l.tinmoney ?? 0) : l.toutmoney;
      const tanka = taxIn ? (Number(l.suu) ? Math.round(money / Number(l.suu)) : 0) : l.touttanka;
      return [
        { text: String(l.line), fontSize: 7, alignment: 'center' }, { text: l.gcode ?? '', alignment: 'center' }, this.goodsCell(l),
        { text: yen(l.suu), alignment: 'right' }, { text: l.unit ?? '', alignment: 'center' },
        { text: tanka ? yen(tanka) : '', alignment: 'right' }, { text: yen(money), alignment: 'right' }
      ];
    });
    while (body.length < 10) {
      body.push(['', '', '', '', '', '', '']);
    }
    // 税率ごとの対象額（税込）と消費税（インボイスの記載）
    let tax8 = 0;
    let tax10 = 0;
    if (!d.total8) {
      tax10 = d.taxtotal;
    } else if (!d.total10) {
      tax8 = d.taxtotal;
    } else {
      tax10 = Math.round(d.total10 / 11);
      tax8 = d.taxtotal - tax10;
    }
    const rates: Content[] = [];
    if (d.total10 || !d.total8) {
      rates.push({ columns: [{ width: 60, text: '10%対象額' }, { width: 60, text: '¥' + yen(d.total10), alignment: 'right' }] },
        { columns: [{ width: 60, text: '10%消費税' }, { width: 60, text: '¥' + yen(tax10), alignment: 'right' }] });
    }
    if (d.total8) {
      rates.push({ columns: [{ width: 60, text: '8%対象額' }, { width: 60, text: '¥' + yen(d.total8), alignment: 'right' }] },
        { columns: [{ width: 60, text: '8%消費税' }, { width: 60, text: '¥' + yen(tax8), alignment: 'right' }] });
    }
    const sumCell = (label: string, v: number): TableCell => ({
      stack: [{ text: label, fontSize: 8 }, { text: '¥' + yen(v), fontSize: 13, alignment: 'right' }]
    });
    const sums: TableCell[] = [{ text: '合計', fontSize: 14, bold: true, margin: [0, 6, 0, 0] }];
    if (f.goodsTotal) {
      sums.push(sumCell('税抜商品計', d.gtotal ?? 0));
    }
    sums.push(sumCell('税抜', d.zeinuki), sumCell('税額', d.taxtotal), sumCell('総額', d.total));
    // 下の欄: 別納は［発注元］に受注先、それ以外は［納品先］
    const sakiLabel = betsuno ? '［発注元］' : '［納品先］';
    const sakiName = betsuno ? d.orderer.name : d.nsaki.name;
    const memo = [...lines(d.dmemo), ...lines(d.nmemo)];
    const note = f.furikomiNote
      ? '※お振込みでお支払いいただく場合は、お手数をおかけしますが、\n　お名前及びお客様コード(' + d.mcode + ')をご入力頂きますようお願い申し上げます'
      : '';
    const kingaku: Content = f.kingaku
      ? {
        margin: [0, 6, 0, 6],
        columns: [
          { width: 340, stack: [
            { columns: [{ width: 120, text: f.kingaku, fontSize: 13, alignment: 'right' }, { width: 130, text: '¥' + yen(d.total), fontSize: 18, bold: true, alignment: 'right' }, { width: 50, text: '(税込)', fontSize: 8, margin: [4, 8, 0, 0] }] },
            { canvas: [{ type: 'line', x1: 20, y1: 2, x2: 330, y2: 2, lineWidth: 0.6 }] }
          ] },
          { width: '*', text: '' },
          { width: 100, table: { widths: ['*', '*'], heights: [12, 48], body: [[{ text: '検　　印', colSpan: 2, alignment: 'center' }, ''], ['', '']] }, layout: grid }
        ]
      }
      : {
        margin: [0, 6, 0, 6],
        columns: [{ width: '*', text: '' }, { width: 100, table: { widths: ['*', '*'], heights: [12, 48], body: [[{ text: '検　　印', colSpan: 2, alignment: 'center' }, ''], ['', '']] }, layout: grid }]
      };

    return {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 24],
      info: { title: f.name + ' ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      header: (page: number, pages: number) => ({ text: page + ' / ' + pages, alignment: 'right', fontSize: 9, margin: [0, 12, 34, 0] }),
      content: [
        {
          columns: [
            { width: '*', text: '' },
            { width: 'auto', text: f.title, fontSize: 22, bold: true },
            { width: '*', stack: stamp ? [{ image: stamp, width: 54, alignment: 'right', margin: [0, -6, 0, 0] }] : [] }
          ],
          margin: [0, 0, 0, 4]
        },
        { columns: [{ width: 250, stack: toBox }, { width: '*', stack: fromStack }], columnGap: 14 },
        { text: f.msg ?? '', margin: [0, 4, 0, 0] },
        ...(f.validity ? [{ text: f.validity, margin: [0, 2, 0, 0] } as Content] : []),
        kingaku,
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [14, 70, '*', 30, 28, 50, 58], heights: (i: number) => i == 0 ? 12 : 20, body: [head, ...body] },
          layout: grid
        },
        {
          unbreakable: true,
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { columns: [{ width: 160, stack: rates, fontSize: 8, margin: [0, 2, 0, 0] }, { width: '*', table: { widths: [36, ...(f.goodsTotal ? ['*'] : []), '*', '*', '*'], body: [sums] }, layout: grid }] },
                { text: sakiLabel, fontSize: 8, margin: [0, 4, 0, 0] },
                { columns: [{ width: 200, text: sakiName }, { width: 30, text: '様' }] },
                { text: '［備考］', fontSize: 8, margin: [0, 6, 0, 0] },
                { columns: [{ width: '*', stack: memo.map(t => ({ text: t })) }, { width: 170, stack: this.barcode(d.okurino) }] },
                ...(note ? [{ text: note, fontSize: 8, margin: [6, 6, 0, 0] } as Content] : [])
              ]
            }]]
          },
          layout: grid
        }
      ]
    };
  }

  // ===================== 作業指示書 =====================
  private workDoc(d: ShipDoc, opt: DenPrintOption): TDocumentDefinitions {
    const f = opt.form;
    const to = d.nsaki;
    const nameRow: Content = { columns: [{ width: '*', text: f.boxText ? d.orderer.name : to.name, fontSize: 12 }, { width: 30, text: '様', fontSize: 12, alignment: 'right' }] };
    const toBox = box(f.boxText
      ? [
        { text: f.boxText, fontSize: 14, bold: true, margin: [20, 10, 0, 22] },
        nameRow,
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 225, y2: 2, lineWidth: 0.6 }] },
        { text: d.mcode, margin: [20, 2, 0, 0] }
      ]
      : [
        { text: zipText(to.adr?.zip) },
        ...adrLines(to.adr).map(t => ({ text: t } as Content)),
        { text: ' ' },
        nameRow,
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 225, y2: 2, lineWidth: 0.6 }] },
        { text: d.ncode, margin: [20, 2, 0, 0] }
      ], 240, 96);
    const workLine = (w: WorkLine): Content => {
      switch (w.type) {
        case 'ori': return { text: 'ｵﾘﾏｰｸNo.　　　　　×　　　　枚', fontSize: 13, bold: true, margin: [10, 4, 0, 10] };
        case 'kibou': return { text: '出荷希望日：　　　月　　　日', fontSize: 13, bold: true, margin: [0, 4, 0, 6] };
        default: return { text: w.text, fontSize: 11, bold: true, margin: [0, 2, 0, 4] };
      }
    };
    const head: TableCell[] = ['', '商品コード', '商品', '数量', '備　考'].map(t => ({ text: t, bold: true, alignment: 'center' }));
    const body: TableCell[][] = d.lines.map(l => [
      { text: String(l.line), fontSize: 7, alignment: 'center' }, { text: l.gcode ?? '', alignment: 'center' }, this.goodsCell(l),
      { text: yen(l.suu), alignment: 'right' }, ''
    ]);
    while (body.length < 16) {
      body.push(['', '', '', '', '']);
    }
    const memo = [...lines(d.dmemo), ...lines(d.nmemo)];
    return {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 24],
      info: { title: f.name + ' ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      header: (page: number, pages: number) => ({ text: page + ' / ' + pages, alignment: 'right', fontSize: 9, margin: [0, 12, 34, 0] }),
      content: [
        { text: this.titleOf(opt), fontSize: 18, bold: true, alignment: 'center' },
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 535, y2: 2, lineWidth: 0.8 }], margin: [0, 0, 0, 8] },
        {
          columns: [
            { width: 250, stack: [toBox] },
            { width: '*', stack: [...(f.work ?? []).map(workLine), { columns: [{ width: '*', text: '' }, { width: 'auto', stack: [this.infoTable(d, opt, true)] }], margin: [0, 6, 0, 0] }] }
          ],
          columnGap: 14,
          margin: [0, 0, 0, 8]
        },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [14, 80, '*', 34, 130], heights: (i: number) => i == 0 ? 12 : 20, body: [head, ...body] },
          layout: grid
        },
        {
          unbreakable: true,
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: '［納品先］', fontSize: 8 },
                { columns: [{ width: 200, text: d.nsaki.name }, { width: 30, text: '様' }] },
                { text: '［備考］', fontSize: 8, margin: [0, 6, 0, 0] },
                { columns: [{ width: '*', stack: memo.map(t => ({ text: t })) }, { width: 170, stack: this.barcode(d.okurino) }] },
                ...(f.shijisho ? [{ text: '指示書　　　枚', fontSize: 12, bold: true, alignment: 'right', margin: [0, 6, 10, 0] } as Content] : [])
              ],
              margin: [4, 4, 4, 4]
            }]]
          },
          layout: grid
        }
      ]
    };
  }

  // ===================== 受注票 =====================
  private orderDoc(d: ShipDoc, opt: DenPrintOption): TDocumentDefinitions {
    const o = d.orderer;
    const n = d.nsaki;
    const same = !d.betsuno;
    const adrStack = (a: { name: string; adr?: ShipAdr }, code: string, label: string, sameText: boolean): Content => ({
      columns: [
        { width: 70, stack: [{ text: label }, { text: '【ご住所】' }] },
        { width: '*', stack: [
          { text: code },
          { text: '〒' + (sameText ? '' : zipText(a.adr?.zip)) },
          ...(sameText ? [{ text: 'ご注文者と同じ' } as Content] : adrLines(a.adr).map(t => ({ text: t } as Content))),
          { text: ' ' },
          ...(sameText ? [] : [{ columns: [{ width: '*', text: a.name, fontSize: 11 }, { width: 30, text: '様' }] } as Content]),
          { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 250, y2: 2, lineWidth: 0.6 }] },
          { text: sameText ? '' : (a.adr?.tel ?? '') }
        ] }
      ]
    });
    const head: TableCell[] = ['', '商品コード', '商　品　名', '数量', '単価', '金額'].map(t => ({ text: t, bold: true, alignment: 'center' }));
    const body: TableCell[][] = d.lines.map(l => [
      { text: String(l.line), fontSize: 7, alignment: 'center' }, { text: l.gcode ?? '', alignment: 'right' }, this.goodsCell(l),
      { text: yen(l.suu), alignment: 'right' }, { text: l.touttanka ? yen(l.touttanka) : '', alignment: 'right' }, { text: yen(l.toutmoney), alignment: 'right' }
    ]);
    while (body.length < 12) {
      body.push(['', '', '', '', '', '']);
    }
    const memoCell = (label: string, s: string | null | undefined): TableCell => ({ stack: [{ text: label, fontSize: 7 }, { text: s ?? '', margin: [6, 2, 0, 0] }] });
    return {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 24],
      info: { title: '受注票 ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      content: [
        {
          columns: [
            { width: 160, text: opt.dayLabel + '：' + sday(this.dayOf(d, opt.dayLabel)), margin: [0, 10, 0, 0] },
            { width: '*', text: '受　注　票', fontSize: 22, bold: true, alignment: 'center' },
            { width: 160, text: '', alignment: 'right' }
          ]
        },
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 535, y2: 2, lineWidth: 2 }], margin: [0, 0, 0, 6] },
        {
          columns: [
            { width: 330, stack: [
              adrStack(o, d.mcode, 'ご注文者', false),
              { text: '↓', fontSize: 14, alignment: 'center', margin: [0, 2, 0, 2] },
              adrStack(n, d.ncode, 'お届け先', same)
            ] },
            { width: '*', stack: [
              { text: d.system.kname ?? '', fontSize: 12, margin: [0, 4, 0, 20] },
              { text: '決済方法：' + d.payName, margin: [40, 0, 0, 4] },
              { text: '送り状：' + d.hname, margin: [40, 0, 0, 20] },
              { text: d.okurino ?? '', margin: [60, 0, 0, 0] }
            ] }
          ]
        },
        {
          columns: [
            { width: '*', text: '' },
            { width: 'auto', stack: [{ text: '合計金額　　¥' + yen(d.total), fontSize: 18 }, { canvas: [{ type: 'line', x1: 0, y1: 1, x2: 200, y2: 1, lineWidth: 1 }] }] }
          ],
          margin: [0, 10, 0, 14]
        },
        { columns: [{ width: '*', text: '受注番号：' + d.denno }, { width: 'auto', text: '受注日　' + sday(d.day) }], margin: [10, 0, 10, 2] },
        { canvas: [{ type: 'line', x1: 0, y1: 1, x2: 535, y2: 1, lineWidth: 0.6 }], margin: [0, 0, 0, 8] },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [14, 80, '*', 44, 52, 56], heights: (i: number) => i == 0 ? 12 : 20, body: [head, ...body] },
          layout: grid
        },
        {
          margin: [0, 6, 0, 0],
          unbreakable: true,
          table: {
            widths: ['*', '*'],
            heights: [26, 26],
            body: [
              [memoCell('[送り状備考]', d.okuri?.omemo), memoCell('[納品書備考]', d.nmemo)],
              [memoCell('[伝票備考]', d.dmemo), memoCell('[WEBNO]', d.cusden)]
            ]
          },
          layout: { ...grid, vLineWidth: (i: number) => i == 1 ? 0 : 0.6, hLineWidth: (i: number) => i == 1 ? 0 : 0.6 }
        }
      ]
    };
  }

  // ===================== 郵便振込用紙 =====================
  /**
   * 郵便振込用紙（払込取扱票の専用紙に印刷する。A4 横に、現行と同じ位置で文字だけを置く）。
   * 金額欄は ＊ で埋める（現行と同じ）。用紙とずれるときは位置（absolutePosition）を直す
   */
  private furikomiDoc(d: ShipDoc): TDocumentDefinitions {
    const a = FURIKOMI_ACCOUNT;
    const o = d.orderer;
    const wide = (s: string) => s.split('').join(' ');
    const at = (x: number, y: number, c: Content): Content => ({ ...(c as object), absolutePosition: { x, y } } as Content);
    const dt = d.day ? d.day.slice(0, 10).split('-').map(Number) : null;
    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [0, 0, 0, 0],
      info: { title: '郵便振込用紙 ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      content: [
        at(3, 34, { text: wide(a.kigo) + '　' + a.check + '　　　' + wide(a.bango) + '　＊＊＊＊＊＊＊＊', fontSize: 12 }),
        at(18, 57, { text: a.name, fontSize: 9 }),
        at(142, 88, { text: 'No.' + d.denno + '　(' + (dt ? dt[0] + '/' + String(dt[1]).padStart(2, ' ') + '/' + String(dt[2]).padStart(2, ' ') : '') + ')', fontSize: 10 }),
        at(43, 122, { table: { widths: [170], body: [[{ text: 'お支払いは商品到着\n一週間以内にお願い致します。', fontSize: 8 }]] }, layout: grid }),
        at(47, 160, { stack: [
          { text: '〒' + zipText(o.adr?.zip) },
          ...adrLines(o.adr).map(t => ({ text: t } as Content)),
          { text: ' ' },
          { text: o.name },
          { text: o.adr?.tel ?? '', margin: [60, 0, 0, 0] }
        ], fontSize: 9 }),
        at(385, 34, { text: wide(a.kigo) + '　' + a.check, fontSize: 12 }),
        at(405, 61, { text: wide(a.bango), fontSize: 12 }),
        at(376, 88, { text: a.name, fontSize: 6.5, width: 110 } as Content),
        at(376, 124, { text: '＊＊＊＊＊＊＊＊', fontSize: 12 }),
        at(376, 168, { text: o.name, fontSize: 9 })
      ]
    };
  }
}
