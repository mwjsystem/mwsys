import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './../services/pdf.service';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { HatPrintForm } from './hat-forms';

/** 発注書の 1 行（発注明細） */
export interface HatLine {
  line: number;
  gcode: string | null;
  gtext: string | null;
  suu: number;
  genka: number | null;
  money: number | null;
  mmemo: string | null;
  /** 入荷予定日（yyyy-mm-dd） */
  yday: string | null;
  jdenno: number | null;
  unit: string | null;
}

/** 発送先（空欄のときは null） */
export interface HatShipAdr {
  name: string;
  /** コード（倉庫コード・納品先コード） */
  code: string;
  tel: string;
  fax: string;
  zip: string;
  adr: string;
}

/** 発注書 1 枚分のデータ */
export interface HatDoc {
  denno: number;
  day: string;
  vcode: string;
  vendor: { name: string; tel: string; fax: string; tanto: string; adr: string };
  scode: string;
  store: HatShipAdr | null;
  staffName: string;
  dmemo: string;
  gtotal: number;
  tax: number;
  total: number;
  currency: string;
  lines: HatLine[];
  system: { kname: string; zip: string; adr: string; tel: string; fax: string };
  /** 明細の受注伝票番号（直送のとき、納品先を読む） */
  jdennos: number[];
}

/** 海外発注書の差出人（英文。現行の様式と同じ） */
const PO_COMPANY = [
  'Martial World Japan Co.,Ltd',
  'Semba alpha Bldg. 2F',
  '3-1-6 Bingo-machi',
  'Chuo-ku,Osaka 542-0051 Japan',
  'Phn:+81-6-4963-2224',
  'Fax:+81-6-4963-2229'
];

interface PrintResult {
  trhatden_by_pk: {
    denno: number; day: string; vcode: string | null; scode: string | null; tcode: string | null; dmemo: string | null;
    gtotal: number | null; tax: number | null; total: number | null; currency: string | null;
    msvendor: { adrname: string | null; tel: string | null; fax: string | null; tanto: string | null; zip: string | null; region: string | null; local: string | null }[];
    vhatzns: (Omit<HatLine, 'unit'> & { msgood: { unit: string | null } | null })[];
  } | null;
  mssystem: { kname: string | null; zip: string | null; adr: string | null; tel: string | null; fax: string | null }[];
}

const s = (v: string | null | undefined): string => v ?? '';
const zipText = (z: string | null | undefined): string => z ? '〒' + z.replace(/^(\d{3})(\d{4})$/, '$1-$2') : '';
const jday = (day: string | null | undefined): string => {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.slice(0, 10).split('-');
  return y + '年' + Number(m) + '月' + Number(d) + '日';
};
const slashDay = (day: string | null | undefined): string => day ? day.slice(0, 10).replace(/-/g, '/') : '';
const memoLines = (v: string | null | undefined): string[] => (v ?? '').split(/\r?\n/).filter(e => e.trim());

/** 罫線の表 */
const grid = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: '#333333', vLineColor: '#333333',
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2
};

/**
 * 発注伝票の帳票（発注書・見積り依頼・在庫確認依頼・海外発注書）の PDF。様式は hat-forms.ts。
 * 和文は A4 縦、海外発注書（Purchase Order）は A4 横
 */
@Injectable({
  providedIn: 'root'
})
export class HatPdfService {
  private apollo = inject(Apollo);
  private pdfsrv = inject(PdfService);
  private usrsrv = inject(UserService);
  private stfsrv = inject(StaffService);
  private strsrv = inject(StoreService);

  /** 発注伝票を読み、帳票のデータにする */
  async load(denno: number): Promise<HatDoc> {
    const Get = gql`
      query get_hatprint($id: smallint!, $dno: Int!) {
        trhatden_by_pk(denno: $dno, id: $id) {
          denno day vcode scode tcode dmemo gtotal tax total currency
          msvendor { adrname tel fax tanto zip region local }
          vhatzns { line gcode gtext suu genka money mmemo yday jdenno msgood { unit } }
        }
        mssystem(where: {id: {_eq: $id}}) { kname zip adr tel fax }
      }`;
    const res = await firstValueFrom(this.apollo.query<PrintResult>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('発注伝票を読めませんでした');
    }
    const h = res.data.trhatden_by_pk;
    if (!h) {
      throw new Error('発注伝票 ' + denno + ' が見つかりません');
    }
    if (this.stfsrv.tcds.length == 0) {
      await this.stfsrv.getStaff();
    }
    const v = h.msvendor[0];
    const st = h.scode ? await this.strsrv.getStradr(h.scode) : null;
    const store: HatShipAdr | null = st && typeof st == 'object' && 'name' in st
      ? { name: s(st.name), code: s(h.scode), tel: s(st.tel), fax: s(st.fax), zip: s(st.zip), adr: [st.region, st.local, st.street, st.extend].filter(e => e).join('') }
      : null;
    const sys = res.data.mssystem[0];
    const lines: HatLine[] = [...h.vhatzns]
      .sort((a, b) => a.line - b.line)
      .map(({ msgood, ...l }) => ({ ...l, unit: msgood?.unit ?? null }));
    return {
      denno: h.denno,
      day: s(h.day),
      vcode: s(h.vcode),
      vendor: { name: s(v?.adrname), tel: s(v?.tel), fax: s(v?.fax), tanto: s(v?.tanto), adr: [v?.region, v?.local].filter(e => e).join('') },
      scode: s(h.scode),
      store,
      staffName: h.tcode ? this.stfsrv.getName(h.tcode) : '',
      dmemo: s(h.dmemo),
      gtotal: Number(h.gtotal ?? 0),
      tax: Number(h.tax ?? 0),
      total: Number(h.total ?? 0),
      currency: s(h.currency) || 'JPY',
      lines,
      system: { kname: s(sys?.kname), zip: s(sys?.zip), adr: s(sys?.adr), tel: s(sys?.tel), fax: s(sys?.fax) },
      jdennos: [...new Set(lines.map(l => Number(l.jdenno)).filter(n => n > 0))]
    };
  }

  /** PDF を作る。shipTo は発送先（null は空欄） */
  make(d: HatDoc, form: HatPrintForm, shipTo: HatShipAdr | null): Promise<Blob> {
    return this.pdfsrv.createPdf(form.po ? this.poDoc(d, form) : this.jpDoc(d, form, shipTo));
  }

  /** 金額の表示（USD は小数 2 桁） */
  private num(d: HatDoc, v: number | null | undefined): string {
    const usd = d.currency == 'USD';
    return Number(v ?? 0).toLocaleString('ja-JP', usd ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  }

  private cur(d: HatDoc): string {
    return d.currency == 'USD' ? '$' : '¥';
  }

  // ===================== 和文の発注書（A4 縦） =====================
  private jpDoc(d: HatDoc, f: HatPrintForm, shipTo: HatShipAdr | null): TDocumentDefinitions {
    const sys = d.system;
    const big = f.size != 'normal';
    const huge = f.size == 'huge';
    const fromStore = !!f.fromStore && !!d.store;
    // 差出人（右上）
    const from: Content[] = fromStore
      ? [
        { text: sys.kname, fontSize: 10, alignment: 'right' },
        { text: d.store!.name, fontSize: 14, alignment: 'right' },
        { text: zipText(d.store!.zip) + ' ' + d.store!.adr, alignment: 'right', margin: [0, 2, 0, 0] },
        { text: 'TEL:' + d.store!.tel + '　FAX:' + d.store!.fax, alignment: 'right' }
      ]
      : [
        { text: sys.kname, fontSize: 12 },
        { text: zipText(sys.zip), margin: [8, 1, 0, 0] },
        { text: sys.adr, margin: [8, 0, 0, 0] },
        { text: 'TEL　' + sys.tel + '　FAX　' + sys.fax, margin: [8, 6, 0, 0] },
        { text: '担当者　' + d.staffName, margin: [8, 0, 0, 0] }
      ];
    // 宛先（左上）
    const to: Content[] = [
      { text: d.vcode, fontSize: 7 },
      { text: d.vendor.name + '　御中', fontSize: 13 },
      { text: 'TEL　' + d.vendor.tel + '　　FAX　' + d.vendor.fax, margin: [0, 12, 0, 0] }
    ];
    const stampBox: Content = {
      columns: [{ width: '*', text: '' }, {
        width: 'auto',
        table: { widths: f.price == 'amount' ? [30, 30, 30] : [40], heights: [40], body: [f.price == 'amount' ? ['', '', ''] : ['']] },
        layout: { ...grid, hLineWidth: () => 1.2, vLineWidth: () => 1.2 }
      }]
    };

    // 明細
    const amount = f.price == 'amount';
    const tanka = f.price != 'none';
    const memoHead = amount ? '入荷予定・備　考' : f.nouki ? '希望納期　/　備　考' : '備　考';
    const head: TableCell[] = [
      'No', big ? '品番／商品名称' : '商品CD　　商　品　名　称', '数　量', ...(tanka ? ['単　価'] : []), ...(amount ? ['金　額'] : []), memoHead
    ].map(t => ({ text: t, alignment: 'center', fontSize: 8 }));
    const codeSize = huge ? 26 : big ? 13 : 9;
    const nameSize = huge ? 20 : big ? 8 : 8;
    const suuSize = huge ? 26 : big ? 14 : 9;
    const memoOf = (l: HatLine): string => {
      const t: string[] = [];
      if ((amount || f.nouki) && l.yday) {
        t.push(slashDay(l.yday));
      }
      t.push(...memoLines(l.mmemo));
      return t.join('\n');
    };
    const body: TableCell[][] = d.lines.map(l => [
      { text: String(l.line), fontSize: 8, alignment: 'center' },
      {
        stack: [
          { text: s(l.gcode), fontSize: codeSize, alignment: 'center' },
          { text: s(l.gtext), fontSize: nameSize, margin: huge ? [0, 28, 0, 0] : [0, 1, 0, 0] }
        ]
      },
      { text: this.num({ ...d, currency: 'JPY' }, l.suu), fontSize: suuSize, alignment: 'right', margin: [0, huge ? 36 : big ? 6 : 4, 0, 0] },
      ...(tanka ? [{ text: l.genka != null ? this.num(d, l.genka) : '', alignment: 'right', fontSize: 9, margin: [0, big ? 8 : 4, 0, 0] } as TableCell] : []),
      ...(amount ? [{ text: this.num(d, l.money), alignment: 'right', fontSize: 9, margin: [0, 4, 0, 0] } as TableCell] : []),
      { text: memoOf(l), fontSize: 8 }
    ]);
    const cols = head.length;
    // 1 ページに収まる行数（明細がこれより多いときは次のページへ続く）
    const minRows = huge ? 3 : big ? 9 : 12;
    while (body.length < minRows) {
      body.push(Array.from({ length: cols }, () => ''));
    }
    const widths: (number | string)[] = [16, '*', huge ? 70 : 50, ...(tanka ? [55] : []), ...(amount ? [60] : []), huge ? 110 : amount ? 110 : 150];
    const rowHeight = huge ? 150 : big ? 42 : 28;
    if (amount) {
      // 合計の行
      const sumRow: TableCell[] = Array.from({ length: cols }, () => '');
      sumRow[cols - 3] = { text: '合　計', alignment: 'center', margin: [0, 6, 0, 0] };
      sumRow[cols - 2] = { text: this.num(d, d.gtotal), alignment: 'right', margin: [0, 6, 0, 0] };
      body.push(sumRow);
    }

    // 下の欄: 伝票備考（税込合計）と発送先
    const bottom: Content[] = [
      {
        unbreakable: true,
        table: {
          widths: ['*'],
          heights: [huge ? 50 : 56],
          body: [[{
            stack: [
              ...memoLines(d.dmemo).map(t => ({ text: t } as Content)),
              ...(f.price == 'tanka' ? [{ text: '合計(税込)　' + this.cur(d) + this.num(d, d.total), alignment: 'right', fontSize: 11, margin: [0, 4, 10, 0] } as Content] : [])
            ],
            margin: [4, 2, 4, 2]
          }]]
        },
        layout: { ...grid, hLineWidth: () => 1.2, vLineWidth: () => 1.2 }
      },
      {
        margin: [0, 6, 0, 0],
        unbreakable: true,
        columns: [
          { width: 50, stack: [{ text: '発送先', bold: true, fontSize: 9 }, ...(shipTo?.code ? [{ text: '( ' + shipTo.code + ' )', fontSize: 8, margin: [0, 4, 0, 0] } as Content] : [])] },
          {
            width: '*',
            stack: shipTo
              ? [
                { text: shipTo.name + '　様', fontSize: huge ? 20 : 12 },
                { text: (shipTo.tel ? 'TEL　' + shipTo.tel : '') + (shipTo.fax ? '　FAX　' + shipTo.fax : ''), margin: [0, 2, 0, 0] },
                { text: zipText(shipTo.zip) + ' ' + shipTo.adr }
              ]
              : [{ text: '' }]
          }
        ]
      }
    ];

    return {
      pageSize: 'A4',
      pageMargins: [30, 28, 30, 24],
      info: { title: f.name + ' ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      header: (page: number, pages: number) => ({ text: 'Page　' + page + (pages > 1 ? ' / ' + pages : ''), alignment: 'right', fontSize: 9, margin: [0, 10, 30, 0] }),
      content: [
        {
          columns: [
            { width: '*', text: f.title, fontSize: 22, bold: true },
            { width: 'auto', text: f.dayLabel + '：' + jday(d.day) + '　　' + f.noLabel + '：　' + d.denno, margin: [0, 10, 0, 0] }
          ],
          margin: [0, 4, 0, 8]
        },
        { columns: [{ width: '*', stack: to }, { width: 250, stack: from }], columnGap: 10 },
        stampBox,
        { text: f.msg, margin: [0, -14, 0, 0] },
        ...(fromStore ? [{ text: '※納期等のReFAXは' + d.store!.name + 'までお願い致します。', bold: true, fontSize: 11, margin: [0, 2, 0, 0] } as Content] : []),
        ...(amount ? [{
          margin: [0, 6, 0, 4],
          stack: [
            { columns: [{ width: 90, text: '税抜合計金額', fontSize: 13 }, { width: 120, text: this.cur(d) + this.num(d, d.gtotal), fontSize: 13 }] },
            { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 230, y2: 2, lineWidth: 1.5 }] }
          ]
        } as Content] : [{ text: '', margin: [0, 4, 0, 0] } as Content]),
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths,
            heights: (i: number) => i == 0 ? 12 : (amount && i == body.length) ? 22 : rowHeight,
            body: [head, ...body]
          },
          layout: { ...grid, hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i == 0 || i == 1 || i == node.table.body.length ? 1.2 : 0.6, vLineWidth: (i: number) => i == 0 || i == cols ? 1.2 : 0.6 }
        },
        ...bottom
      ]
    };
  }

  // ===================== 海外発注書（Purchase Order。A4 横） =====================
  private poDoc(d: HatDoc, f: HatPrintForm): TDocumentDefinitions {
    const lbl = (t: string): TableCell => ({ text: t, fontSize: 8 });
    const val = (t: string): TableCell => ({ text: t, fontSize: 9 });
    const info: TableCell[][] = [
      [lbl('To:'), val(d.vendor.name), lbl('Attn:'), val(d.vendor.tanto), lbl('P.O Date:'), val(slashDay(d.day)), lbl('Trade Term:'), val(f.po == 'FOB' ? 'F O B' : 'C & F')],
      [lbl('Fax:'), val(d.vendor.fax), lbl('Phn:'), val(d.vendor.tel), lbl('Del to:'), val('OSAKA'), lbl('Del from:'), val('')],
      [lbl('Packing:'), val('Exp Standard Packing'), lbl('Insured by:'), val('Buyer'), lbl('Payment by:'), val(''), '', ''],
      [lbl('Forwarder:'), val(''), '', '', '', '', '', '']
    ];
    const head: TableCell[] = ['Item Code NO.', 'Item Name', "Q'ty", 'Unit Price', 'Cur.', 'Amount', 'ETA', 'Remarks']
      .map((t, i) => ({ text: t, fontSize: 9, alignment: i >= 2 && i <= 5 ? 'right' : 'left' }));
    const cur = this.cur(d);
    const body: TableCell[][] = d.lines.map(l => [
      { text: s(l.gcode) },
      { text: s(l.gtext) },
      { text: this.num({ ...d, currency: 'JPY' }, l.suu), alignment: 'right' },
      { text: Number(l.genka ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), alignment: 'right' },
      { text: cur, alignment: 'center' },
      { text: Number(l.money ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), alignment: 'right' },
      { text: l.yday ? slashDay(l.yday) : 'YY/MM/DD' },
      { text: memoLines(l.mmemo).join('\n'), fontSize: 8 }
    ]);
    const qty = d.lines.reduce((a, l) => a + Number(l.suu ?? 0), 0);
    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [30, 28, 30, 28],
      info: { title: f.name + ' ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.15 },
      header: (page: number, pages: number) => ({ text: page + ' / ' + pages, alignment: 'right', fontSize: 9, margin: [0, 10, 40, 0] }),
      content: [
        {
          columns: [
            { width: 200, table: { widths: [50, 110], body: [[lbl('P.O No'), { text: String(d.denno), alignment: 'center' }]] }, layout: { ...grid, hLineWidth: () => 1.2, vLineWidth: () => 1.2 }, margin: [0, 16, 0, 0] },
            { width: '*', stack: [{ text: f.title, fontSize: 20, alignment: 'center' }, { canvas: [{ type: 'line', x1: 110, y1: 0, x2: 290, y2: 0, lineWidth: 2 }] }] },
            { width: 160, table: { widths: ['*'], heights: [10, 50], body: [[lbl('Shipping Marks:')], [{ text: 'AS USUAL', fontSize: 8 }]] }, layout: { ...grid, hLineWidth: () => 1.2, vLineWidth: () => 1.2 } }
          ],
          columnGap: 10,
          margin: [0, 0, 0, 10]
        },
        {
          table: { widths: [52, 150, 52, 150, 55, 130, 55, '*'], body: info },
          layout: { ...grid, hLineWidth: () => 1, vLineWidth: () => 1 },
          margin: [0, 0, 0, 24]
        },
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [100, '*', 40, 70, 24, 80, 60, 140], body: [head, ...body] },
          layout: {
            hLineWidth: (i: number) => i == 1 ? 1.5 : 0, vLineWidth: () => 0,
            paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 3, paddingRight: () => 3
          }
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 782, y2: 0, lineWidth: 1.5 }], margin: [0, 30, 0, 4] },
        {
          columns: [
            { width: '*', text: '' },
            { width: 80, text: "P.O Total Q'ty", fontSize: 7, margin: [0, 3, 0, 0] },
            { width: 40, text: this.num({ ...d, currency: 'JPY' }, qty), fontSize: 11, alignment: 'right' },
            { width: 90, text: 'P.O Total Amount', fontSize: 7, margin: [10, 3, 0, 0] },
            { width: 110, text: cur + ' ' + Number(d.gtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), fontSize: 11, alignment: 'right' },
            { width: 160, text: '' }
          ]
        },
        {
          columns: [{ width: '*', text: '' }, {
            width: 200,
            table: { widths: ['*'], body: [[{ stack: PO_COMPANY.map(t => ({ text: t, fontSize: 8 })), margin: [10, 4, 4, 4] }]] },
            layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineStyle: () => ({ dash: { length: 1, space: 1 } }), vLineStyle: () => ({ dash: { length: 1, space: 1 } }) }
          }],
          margin: [0, 20, 0, 0]
        }
      ]
    };
  }
}
