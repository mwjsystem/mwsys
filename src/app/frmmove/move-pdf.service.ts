import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './../services/pdf.service';
import { UserService } from './../services/user.service';

/**
 * 移動伝票の帳票の様式（現行の 7 様式。work/paper/移動伝票）。番号は現行の番号のまま。
 *   ido = 移動伝票（移動先・出庫倉庫の住所）、flow = 出庫元 → 移動先（キープ伝票・本社引取）、
 *   irai = 依頼（発送・お渡し。宛先を入れる）、ori = 織マーク付け、taikai = 大会リスト
 * qr: 倉庫のスマホで読む QR コード（移動伝票の数量を確認・更新する画面）を付ける
 */
export interface MovPrintForm {
  code: number;
  name: string;
  kind: 'ido' | 'flow' | 'irai' | 'ori' | 'taikai';
  title: string;
  dayLabel: string;
  qr?: boolean;
  /** 依頼の宛先の初期値（irai） */
  ate?: string;
}

export const MOV_PRINT_FORMS: MovPrintForm[] = [
  { code: 2, name: '移動伝票', kind: 'ido', title: '移　動　伝　票', dayLabel: '出荷日', qr: true },
  { code: 3, name: 'キープ伝票', kind: 'flow', title: 'キープ　伝　票', dayLabel: '受付日' },
  { code: 4, name: '本社引取', kind: 'flow', title: '本　社　引　取', dayLabel: '受付日' },
  { code: 6, name: '発送依頼', kind: 'irai', title: '【{ate}へ発送お願いします】', dayLabel: '出荷日', ate: '' },
  { code: 7, name: '織マーク付け依頼', kind: 'ori', title: '【{in}にて織マーク付けお願いします】', dayLabel: '出荷日' },
  { code: 8, name: 'お渡し依頼', kind: 'irai', title: '【{ate}へお渡しお願いします】', dayLabel: '出荷日', ate: '豊岡縫製様' },
  { code: 10, name: '大会リスト', kind: 'taikai', title: '大　会　リ　ス　ト', dayLabel: '依頼日', qr: true }
];

/** 倉庫（msstore）の名前・住所 */
export interface MovStore { code: string; name: string; subname: string; zip: string; adr: string[]; tel: string; fax: string }

/** 帳票 1 枚分のデータ */
export interface MovDoc {
  denno: number;
  day: string;
  tcode: string;
  /** 担当者の姓（倉庫宛 FAX フォルダの担当者のフォルダ名） */
  staffSei: string;
  dmemo: string;
  out: MovStore;
  in: MovStore;
  /** 移動伝票の送り先（大会会場など）。無ければ入庫倉庫 */
  sendTo: MovStore | null;
  lines: { line: number; gcode: string; gtext: string; suu: number; memo: string; tanano: string; jan: string }[];
}

interface MovPrintResult {
  trmovsub_by_pk: {
    denno: number; day: string | null; incode: string; outcode: string; tcode: string | null; dmemo: string | null;
    szip: string | null; sadr: string | null; sname: string | null; stel: string | null;
    trmovdens: { line: number; gcode: string; suu: number; memo: string | null; msgood: { gtext: string | null; tanano: string | null; jan: string | null } | null }[];
  } | null;
  msstore: { code: string; name: string | null; subname: string | null; zip: string | null; region: string | null; local: string | null; street: string | null; extend: string | null; tel: string | null; fax: string | null }[];
  msstaff: { code: string; sei: string | null }[];
}

const s = (v: string | null | undefined): string => v ?? '';
const zipText = (z: string | null | undefined): string => z ? '〒' + z.replace(/^(\d{3})(\d{4})$/, '$1-$2') : '';
const slashDay = (day: string): string => {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.slice(0, 10).split('-');
  return y + '/' + Number(m) + '/' + String(Number(d)).padStart(2, ' ');
};
const jday = (day: string): string => {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.slice(0, 10).split('-');
  return y + '年' + Number(m) + '月' + Number(d) + '日';
};

const grid = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: '#333333', vLineColor: '#333333',
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2
};

/**
 * 移動伝票の帳票（A4 縦）。移動伝票・大会リストには、倉庫のスマホで読む QR コード（数量の確認）を付ける
 */
@Injectable({
  providedIn: 'root'
})
export class MovePdfService {
  private apollo = inject(Apollo);
  private pdfsrv = inject(PdfService);
  private usrsrv = inject(UserService);

  /** 倉庫のスマホで読む QR コードの URL（移動伝票の数量の確認） */
  checkUrl(denno: number): string {
    return window.location.origin + '/frmmove/check/' + denno + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test');
  }

  async load(denno: number): Promise<MovDoc> {
    const Get = gql`
      query get_movprint($id: smallint!, $dno: Int!) {
        trmovsub_by_pk(id: $id, denno: $dno) {
          denno day incode outcode tcode dmemo szip sadr sname stel
          trmovdens(order_by: {line: asc}) { line gcode suu memo msgood { gtext tanano jan } }
        }
        msstore(where: {id: {_eq: $id}}) { code name subname zip region local street extend tel fax }
        msstaff(where: {id: {_eq: $id}}) { code sei }
      }`;
    const res = await firstValueFrom(this.apollo.query<MovPrintResult>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('移動伝票を読めませんでした');
    }
    const m = res.data.trmovsub_by_pk;
    if (!m) {
      throw new Error('移動伝票 ' + denno + ' が見つかりません');
    }
    const store = (code: string): MovStore => {
      const e = res.data!.msstore.find(x => x.code == code);
      return {
        code, name: s(e?.name) || code, subname: s(e?.subname) || s(e?.name) || code, zip: s(e?.zip),
        adr: [[e?.region, e?.local].filter(x => x).join(''), s(e?.street), s(e?.extend)].filter(x => x), tel: s(e?.tel), fax: s(e?.fax)
      };
    };
    const own = !!s(m.sadr).trim();
    return {
      denno: m.denno,
      day: s(m.day),
      tcode: s(m.tcode),
      staffSei: s(res.data.msstaff.find(e => e.code == m.tcode)?.sei),
      dmemo: s(m.dmemo),
      out: store(m.outcode),
      in: store(m.incode),
      sendTo: own ? { code: m.incode, name: s(m.sname) || store(m.incode).name, subname: s(m.sname), zip: s(m.szip), adr: [s(m.sadr)], tel: s(m.stel), fax: '' } : null,
      lines: m.trmovdens.map(l => ({
        line: l.line, gcode: l.gcode, gtext: s(l.msgood?.gtext), suu: Number(l.suu ?? 0), memo: s(l.memo),
        tanano: s(l.msgood?.tanano), jan: s(l.msgood?.jan)
      }))
    };
  }

  /** PDF を作る。ate は依頼の宛先（空なら手書き用の空白） */
  make(d: MovDoc, f: MovPrintForm, ate: string): Promise<Blob> {
    return this.pdfsrv.createPdf(this.doc(d, f, ate));
  }

  private doc(d: MovDoc, f: MovPrintForm, ate: string): TDocumentDefinitions {
    const taikai = f.kind == 'taikai';
    const title = f.title.replace('{ate}', ate.trim() || '　'.repeat(12)).replace('{in}', d.in.subname);
    const qr: Content[] = f.qr
      ? [{ stack: [{ qr: this.checkUrl(d.denno), fit: 64, alignment: 'center', eccLevel: 'M' }, { text: '倉庫確認', fontSize: 7, alignment: 'center' }], width: 70 } as Content]
      : [];
    const staffBox = (heads: string[], body: string[] = heads.map(() => '')): Content => ({
      columns: [{ width: '*', text: '' }, {
        width: 'auto',
        table: { widths: heads.map(() => 56), heights: [10, 30], body: [heads.map(h => ({ text: h, fontSize: 7, alignment: 'center' })), body.map(b => ({ text: b, alignment: 'center', margin: [0, 8, 0, 0] }))] },
        layout: grid
      }]
    });
    const storeBlock = (st: MovStore, align: 'left' | 'right' = 'left'): Content[] => [
      { text: zipText(st.zip), alignment: align },
      ...st.adr.map(t => ({ text: t, alignment: align } as Content)),
      { text: st.name, fontSize: 11, margin: [0, 6, 0, 0], alignment: align },
      { text: (st.tel ? 'TEL:' + st.tel : '') + (st.fax ? '  FAX:' + st.fax : ''), alignment: align }
    ];

    let head: Content[];
    switch (f.kind) {
      case 'ido': {
        const to = d.sendTo ?? d.in;
        head = [
          {
            columns: [
              { width: '*', text: '' },
              { width: 'auto', stack: [{ text: f.title, fontSize: 18, bold: true, alignment: 'center' }, { text: f.dayLabel + '：' + slashDay(d.day), alignment: 'center' }] },
              { width: '*', stack: [{ text: '伝票NO：' + d.denno, alignment: 'right', fontSize: 10 }] },
              ...qr
            ],
            columnGap: 8
          },
          {
            columns: [
              { width: '*', stack: [
                { text: '≪移動先倉庫≫', fontSize: 8 },
                { text: zipText(to.zip), fontSize: 11 },
                ...to.adr.map(t => ({ text: t, fontSize: 11 } as Content)),
                { text: to.name + '　　御中', fontSize: 12, margin: [0, 10, 0, 0] }
              ] },
              { width: 230, stack: [...storeBlock(d.out), staffBox(['承認者', '担当者'])] }
            ],
            margin: [0, 6, 0, 8]
          }
        ];
        break;
      }
      case 'flow':
        head = [
          {
            columns: [
              { width: 170, text: d.out.subname + '　御中', fontSize: 10 },
              { width: '*', stack: [{ text: f.title, fontSize: 20, alignment: 'center' }, { canvas: [{ type: 'line', x1: 30, y1: 2, x2: 215, y2: 2, lineWidth: 2.5 }] }] },
              { width: 130, text: '伝票NO：' + d.denno, alignment: 'right', fontSize: 9 }
            ]
          },
          {
            columns: [
              { width: '*', stack: [
                { text: '≪出庫元倉庫≫', fontSize: 8, margin: [0, 10, 0, 0] },
                { text: d.out.name, fontSize: 12 },
                { text: '↓', fontSize: 14, margin: [20, 0, 0, 0] },
                { text: '≪移動先倉庫≫', fontSize: 8 },
                { text: (d.sendTo ?? d.in).name, fontSize: 12 }
              ] },
              { width: 260, stack: [{ text: f.dayLabel + '：' + jday(d.day), fontSize: 18, alignment: 'right', margin: [0, 30, 0, 6] }, staffBox(['担当者'])] }
            ],
            margin: [0, 0, 0, 8]
          }
        ];
        break;
      case 'irai':
        head = [
          { columns: [{ width: '*', text: title, fontSize: 16, alignment: 'center' }, { width: 110, text: '伝票NO：' + d.denno, alignment: 'right', fontSize: 9 }] },
          {
            columns: [
              { width: '*', stack: [{ text: f.dayLabel + '：' + slashDay(d.day), margin: [0, 30, 0, 0] }] },
              { width: 230, stack: [...storeBlock(d.out), staffBox(['承認者', '担当者'])] }
            ],
            margin: [0, 10, 0, 8]
          }
        ];
        break;
      case 'ori':
        head = [
          { columns: [{ width: '*', text: title, fontSize: 16, alignment: 'center' }, { width: 110, text: '伝票NO：' + d.denno, alignment: 'right', fontSize: 9 }] },
          { text: '***ｵﾘﾏｰｸを指示書に添付してください***', fontSize: 12, alignment: 'center', margin: [0, 16, 0, 8] },
          { text: 'オリマークNo.　　　　×　　　　枚', fontSize: 13, alignment: 'center', margin: [0, 0, 0, 8] },
          { columns: [{ width: '*', text: f.dayLabel + '：' + slashDay(d.day), alignment: 'center' }, { width: 140, stack: [staffBox(['伝票番号', '担当者'], [String(d.denno), ''])] }], margin: [0, 0, 0, 8] }
        ];
        break;
      default:
        // 大会リスト
        head = [
          {
            columns: [
              { width: 130, text: f.dayLabel + '：' + jday(d.day), fontSize: 10 },
              { width: '*', stack: [{ text: f.title, fontSize: 20, bold: true, alignment: 'center' }, { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 230, y2: 2, lineWidth: 1 }] }] },
              { width: 130, stack: [{ text: '伝票NO：' + d.denno, fontSize: 12 }, { text: '担当者コード　' + d.tcode, fontSize: 8, margin: [0, 4, 0, 0] }] },
              ...qr
            ],
            columnGap: 8
          },
          {
            text: d.out.subname + ' → ' + (d.sendTo ?? d.in).name + (d.dmemo ? '　' + d.dmemo : ''),
            margin: [0, 6, 0, 6]
          }
        ];
    }

    const cols = taikai ? ['NO', '商品コード', '商品名', '数量', '備考'] : ['NO', '棚　番', '商品コード', '商品名', '数量', '備考'];
    const widths = taikai ? [18, 100, '*', 36, 150] : [18, 50, 100, '*', 36, 120];
    const body: TableCell[][] = d.lines.map(l => [
      { text: String(l.line), alignment: 'right', fontSize: 8 },
      ...(taikai ? [] : [{ text: l.tanano } as TableCell]),
      { text: l.gcode, alignment: 'right' },
      { text: l.gtext },
      { text: String(l.suu), alignment: 'right' },
      { text: l.memo, fontSize: 8 }
    ]);
    // 1 ページに収まる行数（明細がこれより多いときは次のページへ続く）
    const minRows = taikai ? 30 : f.kind == 'flow' ? 28 : f.kind == 'ori' ? 27 : 24;
    while (body.length < minRows) {
      body.push(cols.map(() => ''));
    }
    return {
      pageSize: 'A4',
      pageMargins: [24, 24, 24, 20],
      info: { title: f.name + ' ' + d.denno },
      defaultStyle: { fontSize: 9, lineHeight: 1.1 },
      footer: (page: number, pages: number) => pages > 1 ? { text: page + ' / ' + pages, alignment: 'right', fontSize: 8, margin: [0, 4, 24, 0] } : { text: '' },
      content: [
        ...head,
        {
          table: { headerRows: 1, dontBreakRows: true, widths, heights: (i: number) => i == 0 ? 10 : 17, body: [cols.map(t => ({ text: t, fontSize: 7, alignment: 'center' })), ...body] },
          layout: grid
        },
        ...(d.dmemo && !taikai ? [{ text: '備考：' + d.dmemo, margin: [0, 4, 0, 0] } as Content] : [])
      ]
    };
  }
}
