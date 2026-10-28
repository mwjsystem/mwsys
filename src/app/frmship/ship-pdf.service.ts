import { Injectable, inject } from '@angular/core';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './../services/pdf.service';
import { CHECKERS, DenForm, isObi, shipNote } from './ship-forms';

/** 住所（msmadr） */
export interface ShipAdr { mcode: string; eda: number; zip: string | null; region: string | null; local: string | null; street: string | null; extend: string | null; extend2: string | null; adrname: string | null }
/** 受注明細（trjyumei + 商品マスタの単位・棚番） */
export interface ShipLine { line: number; gcode: string; gtext: string; suu: number; touttanka: number; toutmoney: number; taxrate: string | null; mmemo: string | null; unit: string | null; tanano: string | null; jan?: string | null; spec?: string | null; scode?: string | null }
/** 会社情報（mssystem） */
export interface ShipSystem { kname: string | null; invno: string | null; zip: string | null; adr: string | null; tel: string | null; fax: string | null }

/** 帳票 1 件分のデータ（ShipService が組み立てる） */
export interface ShipDoc {
  denno: number;
  mcode: string;
  ncode: string;
  /** 受注先・納品先が違う（または別納品先の住所）か */
  betsuno: boolean;
  /** 受注先の名前・住所 */
  orderer: { name: string; adr?: ShipAdr };
  /** 納品先の名前・住所 */
  nsaki: { name: string; adr?: ShipAdr };
  /** 依頼主（受注伝票の依頼主住所）。無ければ undefined */
  irai?: { name: string; adr?: ShipAdr };
  /** 出荷予定日（yyyy-mm-dd） */
  sday: string;
  /** 売上日（yyyy-mm-dd） */
  uday: string | null;
  okurino: string | null;
  okurisuu: number | null;
  /** 配送コード・配送伝票名 */
  hcode: string;
  hname: string;
  /** 担当者名（姓名） */
  staffName: string;
  /** 支払方法 */
  payName: string;
  /** キープ（キープ表FAX済 など） */
  keep: string;
  dmemo: string;
  nmemo: string;
  /** 金額（返品は負の値にしてある） */
  total: number;
  taxtotal: number;
  zeinuki: number;
  total8: number;
  total10: number;
  lines: ShipLine[];
  system: ShipSystem;
  /** 出荷指示書の QR コード（倉庫のスマホでピッキングの画面を開く URL）。空なら出さない */
  pickUrl?: string;
}

const yen = (v: number | null | undefined): string => Number(v ?? 0).toLocaleString('ja-JP');
const jday = (day: string | null): string => {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.split('-');
  return y + '年' + Number(m) + '月' + Number(d) + '日';
};
const zip = (z: string | null | undefined): string => z ? '〒' + z.replace(/^(\d{3})(\d{4})$/, '$1-$2') : '';
/** 住所を 2 行（都道府県～番地 / 建物）にする */
const adrLines = (a?: ShipAdr): string[] => a
  ? [[a.region, a.local, a.street].filter(e => e).join(''), [a.extend, a.extend2].filter(e => e).join(' ')].filter(e => e)
  : [];
const lines = (s: string): string[] => (s ?? '').split(/\r?\n/).filter(e => e.trim());

/** 細い罫線の表 */
const thin = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: '#555555', vLineColor: '#555555',
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 1, paddingBottom: () => 1
};

/**
 * 出荷指示の帳票（PDF）の作成。様式は現行の Excel マクロ「伝票一括処理.xlsm」に合わせる。
 *   ・納品書（A5 横。form1 / form2）: 帳票タイプ（受注伝票の納品書タイプ）でタイトル・文言・金額の有無が変わる
 *   ・出荷指示書（A4 縦。form3）: 倉庫の作業用
 */
@Injectable({
  providedIn: 'root'
})
export class ShipPdfService {
  private pdfsrv = inject(PdfService);

  /** 納品書（帳票タイプ form の様式） */
  async nohin(d: ShipDoc, form: DenForm): Promise<Blob> {
    return this.pdfsrv.createPdf(this.nohinDoc(d, form));
  }

  /** 出荷指示書 */
  async shiji(d: ShipDoc, form: DenForm | undefined): Promise<Blob> {
    return this.pdfsrv.createPdf(this.shijiDoc(d, form));
  }

  /** キープ表（A4 縦。倉庫へ FAX して在庫を確保してもらう。実物の商品だけを載せる） */
  async keep(d: ShipDoc, url: string): Promise<Blob> {
    return this.pdfsrv.createPdf(this.keepDoc(d, url));
  }

  private keepDoc(d: ShipDoc, url: string): TDocumentDefinitions {
    const now = new Date();
    const items = d.lines.filter(l => shipNote(l.gcode ?? '', l.gtext ?? '', d.mcode).check && Number(l.suu) > 0);
    const head: TableCell[] = ['No', '商品コード', '数量', '商品名', '棚番', '確保数', '備考']
      .map(t => ({ text: t, alignment: 'center', fillColor: '#bbbbbb', fontSize: 8 }));
    const body: TableCell[][] = items.map(l => [
      { text: String(l.line), fontSize: 8 },
      { text: l.gcode ?? '', fontSize: 12, bold: true },
      { text: yen(l.suu), fontSize: Number(l.suu) != 1 ? 14 : 12, bold: Number(l.suu) != 1 },
      { text: (l.gtext ?? '') + (l.mmemo ? '\n' + l.mmemo : ''), fontSize: 8 },
      { text: l.tanano ? '棚' + l.tanano : '', fontSize: 11, bold: true },
      '',
      ''
    ]);
    if (body.length == 0) {
      body.push([{ text: '確保する商品がありません', colSpan: 7, alignment: 'center' }, '', '', '', '', '', '']);
    }
    const info: TableCell[][] = [
      [{ text: '伝票No:', alignment: 'right' }, { text: String(d.denno), fontSize: 14 }],
      [{ text: '出荷予定日:', alignment: 'right' }, { text: jday(d.sday), fontSize: 12 }],
      [{ text: '担当者:', alignment: 'right' }, { text: d.staffName, fontSize: 12 }],
      [{ text: '配送伝票:', alignment: 'right' }, { text: d.hname, fontSize: 12 }],
      [{ text: 'FAX日時:', alignment: 'right' }, now.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })]
    ];
    return {
      pageSize: 'A4',
      pageMargins: [28, 30, 28, 40],
      info: { title: 'キープ表 ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      header: (page: number, pages: number) => ({ text: 'Page : ' + page + '/' + pages, alignment: 'right', fontSize: 7, margin: [0, 10, 20, 0] }),
      footer: () => ({ columns: [{ text: d.orderer.name + '　　様' }, { text: 'キープ表　伝票No:' + d.denno, alignment: 'right' }], margin: [28, 10, 28, 0], fontSize: 9 }),
      content: [
        {
          columns: [
            {
              width: '*',
              stack: [
                { table: { widths: [140], body: [[{ text: 'キープ表', fontSize: 18, alignment: 'center' }]] } },
                { text: d.orderer.name + '　　様', fontSize: 15, bold: true, margin: [0, 10, 0, 2] },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 300, y2: 0, lineWidth: 0.8 }] },
                d.betsuno ? { text: '納入先：' + d.nsaki.name + '　様', margin: [0, 4, 0, 0] } : { text: '' }
              ]
            },
            { width: 170, table: { widths: [56, '*'], body: info }, layout: 'noBorders' },
            { width: 80, stack: [{ qr: url, fit: 72, alignment: 'center', eccLevel: 'M' }, { text: 'キープ確認', fontSize: 7, alignment: 'center' }] }
          ]
        },
        {
          margin: [0, 8, 0, 6],
          table: { widths: ['*'], heights: [30], body: [[{ text: [...lines(d.dmemo), ...lines(d.nmemo)].join('\n'), fontSize: 10 }]] },
          layout: thin
        },
        { text: '在庫を確認して確保してください。スマホで右上の QR コードを読み、商品のバーコードを読んで確保数を入力してください。', fontSize: 8, margin: [0, 0, 0, 4] },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [14, 130, 36, '*', 46, 46, 70], heights: (i: number) => i == 0 ? 10 : 30, body: [head, ...body] },
          layout: thin
        }
      ]
    };
  }

  private nohinDoc(d: ShipDoc, form: DenForm): TDocumentDefinitions {
    const money = form.kingaku != '表示なし';
    // 宛先: 納品先宛の様式は納品先の名前、それ以外は受注先の住所と名前
    const to = form.ate == '納品先' ? d.nsaki : d.orderer;
    const toStack: Content[] = [
      ...(form.ate == '納品先' ? [] : [{ text: zip(to.adr?.zip) }, ...adrLines(to.adr).map(t => ({ text: t }))]),
      { text: to.name + '　　様', fontSize: 14, margin: [0, 4, 0, 1] },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.8 }]
      },
      { text: 'お客様コード：　' + (form.ate == '納品先' ? d.ncode : d.mcode), margin: [10, 2, 0, 0] }
    ];
    // 消費税の内訳（現行と同じ計算: 両方あるときは 10% 対象の税込額 / 11 を 10% 分の税とする）
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
    if (money) {
      toStack.push({
        margin: [40, 2, 0, 0],
        table: {
          widths: [60, 70, '*'],
          body: [
            ['(8%対象)', { text: '¥' + yen(d.total8), alignment: 'right' }, '(消費税 ¥' + yen(tax8) + ' )'],
            ['(10%対象)', { text: '¥' + yen(d.total10), alignment: 'right' }, '(消費税 ¥' + yen(tax10) + ' )']
          ]
        },
        layout: { defaultBorder: false, paddingTop: () => 0, paddingBottom: () => 0 }
      });
    }
    // 発行元: 自社、または受注先・依頼主の住所
    const issuer = form.issuer == '受注先' ? d.orderer : form.issuer == '依頼主' ? d.irai : undefined;
    const fromStack: Content[] = [
      { text: form.dayText + ' ' + jday(d.uday ?? d.sday) },
      { text: '伝票No: ' + d.denno, margin: [0, 0, 0, 6] },
      ...(issuer
        ? [{ text: zip(issuer.adr?.zip) }, ...adrLines(issuer.adr).map(t => ({ text: t })), { text: issuer.name }] as Content[]
        : [
          { text: d.system.zip ? '〒' + d.system.zip : '' },
          { text: d.system.adr ?? '' },
          { text: d.system.kname ?? '', fontSize: 10 },
          { text: 'TEL：' + (d.system.tel ?? '') + '　FAX：' + (d.system.fax ?? '') },
          { text: d.system.invno ? '登録番号：' + d.system.invno : '', margin: [10, 2, 0, 0] },
          { text: '注)＊印は軽減税率(8%)適用商品', margin: [10, 0, 0, 0] }
        ] as Content[])
    ];
    const head: TableCell[] = ['No', '商品コード', '商品名', '商品備考', '数量', '単位', '単価', '金額', '']
      .map(t => ({ text: t, alignment: 'center', fillColor: '#cccccc' }));
    const body: TableCell[][] = d.lines.map(l => [
      String(l.line), l.gcode ?? '', l.gtext ?? '', { text: l.mmemo ?? '', fontSize: 7 },
      { text: yen(l.suu), alignment: 'right' }, l.unit ?? '',
      { text: money ? yen(l.touttanka) : '', alignment: 'right' },
      { text: money ? yen(l.toutmoney) : '', alignment: 'right' },
      money && String(l.taxrate) == '8' ? '＊' : ''
    ]);
    // 明細が少ないときは 10 行になるように空行を足す（現行の様式と同じ見た目）
    while (body.length < 10) {
      body.push(['', '', '', '', '', '', '', '', '']);
    }
    // 下段: 納入先（受注先と違うとき）・備考と、支払方法・送り状番号
    const showNsaki = d.betsuno && form.issuer != '受注先';
    const memo = [...lines(d.dmemo), ...lines(d.nmemo)].join('\n');
    const right: Content[] = [];
    if (form.issuer != '受注先') {
      right.push({ text: 'お支払方法：' + d.payName });
    }
    if (form.dokon == 'しない' && d.okurino) {
      right.push({ text: '送り状№：' + d.okurino });
    }
    if (form.title == '受領書') {
      right.push({ table: { widths: [80], heights: [12, 50], body: [[{ text: '受領印', alignment: 'center' }], ['']] }, margin: [20, 4, 0, 0] });
    }
    let notice = '';
    if (form.kingaku == '御請求額' && /^銀振/.test(d.payName)) {
      notice = '※お振込みの際、お名前及びお客様コード(' + d.mcode + ')をご入力頂きますようお願い申し上げます';
    } else if (form.title.startsWith('領収書')) {
      notice = '領収書の再発行はできません。 大切に保管してください';
    }

    return {
      pageSize: 'A5',
      pageOrientation: 'landscape',
      pageMargins: [24, 20, 24, 14],
      info: { title: form.title + ' ' + d.denno },
      defaultStyle: { fontSize: 8, lineHeight: 1.0 },
      header: (page: number, pages: number) => ({ text: 'Page : ' + page + '/' + pages, alignment: 'right', fontSize: 7, margin: [0, 8, 16, 0] }),
      content: [
        { text: form.title, fontSize: 15, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
        { columns: [{ width: '*', stack: toStack }, { width: 200, stack: fromStack }], columnGap: 10 },
        { text: form.msg, margin: [0, 3, 0, 2] },
        money ? {
          table: {
            widths: [70, 110, 40, 60, 50, 60],
            body: [[
              { text: form.kingaku, bold: true, alignment: 'center', fontSize: 9 },
              { text: '¥' + yen(d.total), bold: true, alignment: 'right', fontSize: 12 },
              { text: '税抜き', alignment: 'center' }, { text: yen(d.zeinuki), alignment: 'right' },
              { text: '消費税額', alignment: 'center' }, { text: yen(d.taxtotal), alignment: 'right' }
            ]]
          },
          layout: thin,
          margin: [10, 0, 0, 4]
        } : { text: '' },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [14, 70, '*', 90, 28, 22, 44, 50, 8], body: [head, ...body] },
          layout: thin
        },
        {
          margin: [0, 4, 0, 0],
          columns: [
            {
              width: '*',
              table: {
                widths: [36, '*'],
                body: [
                  [{ text: '納入先', fillColor: '#cccccc', alignment: 'center' }, showNsaki ? d.nsaki.name + '　　様' : ''],
                  [{ text: '備考', fillColor: '#cccccc', alignment: 'center' }, { text: memo, rowSpan: 1 }]
                ]
              },
              layout: thin
            },
            { width: 150, stack: right, margin: [8, 0, 0, 0] }
          ]
        },
        notice ? { text: notice, color: form.kingaku == '御請求額' ? '#c00000' : '#000000', bold: form.kingaku == '御請求額', margin: [0, 4, 0, 0] } : { text: '' }
      ]
    };
  }

  private shijiDoc(d: ShipDoc, form: DenForm | undefined): TDocumentDefinitions {
    const name = d.orderer.name + '　　様';
    const checker: TableCell[][] = CHECKERS.map(r => [r[0], '□ □', r[1], '□ □']);
    // 箱の中の注意書き（現行マクロと同じ条件）
    const notes: string[] = [...lines(d.nmemo)];
    if (d.hcode == '67' || d.hcode == '68') {
      notes.push('梱包の際下面に段ボールを敷いてください！');
    }
    if (d.betsuno) {
      if (d.hcode == '5') {
        notes.push('納入先要確認(福山代引き)！！');
      }
      if (d.mcode != '408223') {
        notes.push('チラシ同梱なし');
      }
    }
    const noDoc = form?.dokon == 'しない';
    let obi = 0;
    const head: TableCell[] = ['No', '商品コード', '数量', '商品名', '棚番', '備考']
      .map(t => ({ text: t, alignment: 'center', fillColor: '#bbbbbb', fontSize: 7 }));
    const body: TableCell[][] = d.lines.map(l => {
      const n = shipNote(l.gcode ?? '', l.gtext ?? '', d.mcode);
      if (isObi(l.gcode ?? '')) {
        obi += Number(l.suu ?? 0);
      }
      const qty = Number(l.suu ?? 0);
      return [
        { text: String(l.line), fontSize: 7 },
        {
          columns: [
            { text: n.code, bold: n.bold, fontSize: 12, width: '*' },
            { text: n.check ? '□' : '', width: 12, fontSize: 12 }
          ]
        },
        {
          columns: [
            { text: yen(qty), bold: qty != 1 || n.memoOnly, fontSize: qty != 1 || n.memoOnly ? 14 : 12, width: '*' },
            { text: n.check ? '□' : '', width: 12, fontSize: 12 }
          ]
        },
        n.memoOnly
          ? { text: l.mmemo ?? '', bold: true, fontSize: 12 }
          : { text: (l.gtext ?? '') + (l.mmemo ? '\n' + l.mmemo : ''), fontSize: 8 },
        { text: l.tanano ? '棚' + l.tanano : '', bold: true, fontSize: 12 },
        { text: n.note, fontSize: 8 }
      ];
    });
    while (body.length < 10) {
      body.push(['', '', '', '', '', '']);
    }
    // 右上の大きな注意（納品書を同梱しない・帯の本数）
    const big: Content[] = [];
    if (d.pickUrl) {
      big.push({ qr: d.pickUrl, fit: 72, alignment: 'center', eccLevel: 'M' });
      big.push({ text: 'ピッキング', fontSize: 7, alignment: 'center', margin: [0, 1, 0, 2] });
    }
    if (noDoc) {
      big.push({ text: '納品書\n同梱なし', fontSize: 20, bold: true, alignment: 'center' });
    }
    if (obi > 20) {
      big.push({ text: '帯本数：' + obi + '本', fontSize: 12, bold: true, alignment: 'center' });
    }

    return {
      pageSize: 'A4',
      pageMargins: [28, 30, 28, 40],
      info: { title: '出荷指示書 ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      header: (page: number, pages: number) => ({ text: 'Page : ' + page + '/' + pages, alignment: 'right', fontSize: 7, margin: [0, 10, 20, 0] }),
      footer: () => ({ columns: [{ text: name }, { text: '伝票No:' + d.denno, alignment: 'right' }], margin: [28, 10, 28, 0], fontSize: 9 }),
      content: [
        {
          columns: [
            {
              width: 330,
              stack: [
                {
                  columns: [
                    { width: 150, table: { widths: [32, 30, 36, 30], body: checker }, layout: 'noBorders', fontSize: 8 },
                    { width: 140, table: { widths: ['*'], body: [[{ text: '出荷指示書', fontSize: 16, alignment: 'center' }]] }, margin: [10, 0, 0, 0] }
                  ]
                },
                { text: name, fontSize: 15, bold: true, margin: [20, 2, 0, 0] },
                { canvas: [{ type: 'line', x1: 10, y1: 0, x2: 330, y2: 0, lineWidth: 0.8 }] },
                {
                  margin: [100, 2, 0, 6],
                  table: {
                    widths: [60, '*'],
                    body: [
                      [{ text: '送り状番号：', alignment: 'right' }, d.okurino ?? ''],
                      [{ text: '個口数：', alignment: 'right' }, String(d.okurisuu ?? '')]
                    ]
                  },
                  layout: 'noBorders'
                }
              ]
            },
            {
              width: '*',
              margin: [10, 24, 0, 0],
              table: {
                widths: [44, '*'],
                body: [
                  [{ text: '発送日:', alignment: 'right' }, { text: jday(d.sday), fontSize: 14 }],
                  [{ text: '伝票No:', alignment: 'right' }, { text: String(d.denno), fontSize: 14 }],
                  [{ text: '担当者:', alignment: 'right' }, { text: d.staffName, fontSize: 14 }],
                  [{ text: '配送伝票:', alignment: 'right' }, { text: d.hname, fontSize: 14, bold: true }]
                ]
              },
              layout: 'noBorders'
            }
          ]
        },
        {
          columns: [
            {
              width: 370,
              table: {
                widths: [10, 100, '*'],
                body: [
                  ['□', { text: '送り状宛先　　納入先', fillColor: '#cccccc' }, d.betsuno ? d.nsaki.name + '　　様' : ''],
                  ['□', { text: '納品書宛先　　　備考', fillColor: '#cccccc' }, lines(d.dmemo).join('\n')],
                  [{ text: d.keep, colSpan: 3, bold: true }, '', '']
                ]
              },
              layout: thin
            },
            { width: '*', stack: big, margin: [6, 0, 0, 0] }
          ]
        },
        {
          margin: [0, 0, 0, 8],
          table: { widths: ['*'], heights: [50], body: [[{ text: notes.join('\n'), fontSize: 13, margin: [8, 6, 0, 0] }]] },
          layout: thin
        },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [14, 150, 50, '*', 50, 100], heights: (i: number) => i == 0 ? 10 : 34, body: [head, ...body] },
          layout: thin
        }
      ]
    };
  }
}
