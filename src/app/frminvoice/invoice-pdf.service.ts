import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { PdfService } from './../services/pdf.service';

/** 請求書に載せる請求伝票のヘッダ */
interface InvHead {
  denno: number;
  mcode: string;
  sday: string;
  zenkai: number;
  nmon: number;
  tmon: number;
  kurikosi: number | null;
  taxmon: number;
  tax: number;
  taxmon8: number | null;
  tax8: number | null;
  taxmon10: number | null;
  tax10: number | null;
  seikyu: number;
}
/** 請求明細（trseikyusub）の 1 行 */
interface InvSub { denno: number; kind: 'J' | 'N'; refdenno: number; day: string; nmoney: number | null; smoney: number | null; tmoney: number | null; memo: string | null }
/** 計上した受注伝票 */
interface InvJyuden { denno: number; ncode: string | null; nadr: number | null; jdstatus: string | null }
/** 受注明細 */
interface InvJyumei { denno: number; line: number; gcode: string; gtext: string; suu: number; touttanka: number; toutmoney: number; taxmoney: number; taxrate: string | null; mmemo: string | null }
/** 請求入金伝票の明細（trnyuden） */
interface InvNyuden { denno: number; line: number; ptype: string | null; nmoney: number; smoney: number; tmoney: number; mmemo: string | null }
/** 住所 */
interface InvAdr { mcode: string; eda: number; zip: string | null; region: string | null; local: string | null; street: string | null; extend: string | null; extend2: string | null; adrname: string | null }
/** 顧客 */
interface InvMember { mcode: string; sei: string; mei: string | null; sscode: string | null; seikyuu: number | null; mail: string | null; tcode1: string | null; msmadrs: InvAdr[] }
/** 担当者 */
interface InvStaff { code: string; mail: string | null }
/** 会社情報 */
interface InvSystem { kname: string | null; invno: string | null; zip: string | null; adr: string | null; tel: string | null; fax: string | null; bank: string | null; kmeigi: string | null }
/** 振込先口座 */
interface InvKoza { code: string; koza: string; mail: string | null }

interface HeadResult { trseikyu: InvHead[]; trseikyusub: InvSub[] }
/** get_invdetail の結果。テスト環境の Hasura にはリレーションが無い表もあるため、関連する表もそれぞれ直接取得する */
interface DetailQuery {
  trjyuden: InvJyuden[];
  trjyumei: InvJyumei[];
  msgoods: { gcode: string; unit: string | null }[];
  trnyuden: InvNyuden[];
  msmember: Omit<InvMember, 'msmadrs'>[];
  msmadr: InvAdr[];
  mssystem: InvSystem[];
  msskoza: InvKoza[];
  msstaff: InvStaff[];
}
/** 組み立て用に整理したデータ */
interface DetailResult {
  trjyuden: (InvJyuden & { trjyumeis: (InvJyumei & { unit: string | null })[] })[];
  trnyuden: InvNyuden[];
  msmember: InvMember[];
  mssystem: InvSystem[];
  msskoza: InvKoza[];
}

/** メールの内容（宛先が無いときは to が空） */
export interface InvoiceMail {
  to: string;
  from: string;
  subject: string;
  body: string;
}

/** 作成した請求書 1 件 */
export interface InvoicePdf {
  denno: number;
  mcode: string;
  /** 請求先名 */
  name: string;
  fileName: string;
  blob: Blob;
  /** 顧客へ送付するメール（現行マクロの createMail と同じ文面） */
  customerMail: InvoiceMail;
  /** 営業担当へ確認を依頼するメール（現行マクロの createMail2 と同じ文面） */
  salesMail: InvoiceMail;
}

/** 明細の 1 行（並べ替え用の日付・伝票番号つき） */
interface DetailRow { day: string; denno: number; order: number; cells: TableCell[] }

const yen = (v: number | null | undefined): string => Number(v ?? 0).toLocaleString('ja-JP');
const yenBlank = (v: number | null | undefined): string => Number(v ?? 0) == 0 ? '' : yen(v);
const slash = (day: string): string => day.replace(/-/g, '/');

/**
 * 請求書（PDF）の作成。様式は現行システムの請求書（Excel マクロ「掛売請求書一括処理」の form1 / form2）に合わせる。
 */
@Injectable({
  providedIn: 'root'
})
export class InvoicePdfService {
  private usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private pdfsrv = inject(PdfService);
  private apollo = inject(Apollo);

  /** 請求伝票（複数可）の請求書 PDF を作る */
  async create(dennos: number[]): Promise<InvoicePdf[]> {
    const id = this.usrsrv.compid;
    const GetHead = gql`
      query get_invhead($id: smallint!, $dnos: [Int!]!) {
        trseikyu(where: {id: {_eq: $id}, denno: {_in: $dnos}}, order_by: {mcode: asc}) {
          denno mcode sday zenkai nmon tmon kurikosi taxmon tax taxmon8 tax8 taxmon10 tax10 seikyu
        }
        trseikyusub(where: {id: {_eq: $id}, denno: {_in: $dnos}}, order_by: {denno: asc, line: asc}) {
          denno kind refdenno day nmoney smoney tmoney memo
        }
      }`;
    const head = (await firstValueFrom(this.apollo.query<HeadResult>({
      query: GetHead, fetchPolicy: 'network-only', variables: { id: id, dnos: dennos }
    }))).data as HeadResult;

    const subs = head.trseikyusub;
    const jdnos = subs.filter(e => e.kind == 'J').map(e => e.refdenno);
    const ndnos = subs.filter(e => e.kind == 'N').map(e => e.refdenno);

    const GetDetail = gql`
      query get_invdetail($id: smallint!, $jdnos: [Int!]!, $ndnos: [Int!]!, $mcds: [String!]!) {
        trjyuden(where: {id: {_eq: $id}, denno: {_in: $jdnos}}) {
          denno ncode nadr jdstatus
        }
        trjyumei(where: {id: {_eq: $id}, denno: {_in: $jdnos}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {denno: asc, line: asc}) {
          denno line gcode gtext suu touttanka toutmoney taxmoney taxrate mmemo
        }
        trnyuden(where: {id: {_eq: $id}, kubun: {_eq: 1}, denno: {_in: $ndnos}}, order_by: {denno: asc, line: asc}) {
          denno line ptype nmoney smoney tmoney mmemo
        }
        msmember(where: {id: {_eq: $id}, mcode: {_in: $mcds}}) {
          mcode sei mei sscode seikyuu mail tcode1
        }
        msstaff(where: {id: {_eq: $id}}) { code mail }
        msmadr(where: {id: {_eq: $id}, mcode: {_in: $mcds}}, order_by: {mcode: asc, eda: asc}) {
          mcode eda zip region local street extend extend2 adrname
        }
        mssystem(where: {id: {_eq: $id}}) { kname invno zip adr tel fax bank kmeigi }
        msskoza(where: {id: {_eq: $id}}) { code koza mail }
      }`;
    const GetUnit = gql`
      query get_invunit($id: smallint!, $gcds: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcds}}) { gcode unit }
      }`;
    const query = async (mcds: string[]) => (await firstValueFrom(this.apollo.query<DetailQuery>({
      query: GetDetail, fetchPolicy: 'network-only', variables: { id: id, jdnos: jdnos, ndnos: ndnos, mcds: mcds }
    }))).data as DetailQuery;
    // 請求先・請求書送付先・納入先の顧客をまとめて取得する（送付先・納入先は 2 回目で）
    let mcds = [...new Set(head.trseikyu.map(e => e.mcode))];
    let q = await query(mcds);
    const more = [
      ...q.msmember.map(e => e.sscode),
      ...q.trjyuden.map(e => e.ncode)
    ].filter((e): e is string => !!e && !mcds.includes(e));
    if (more.length > 0) {
      mcds = [...new Set([...mcds, ...more])];
      q = await query(mcds);
    }
    const gcds = [...new Set(q.trjyumei.map(e => e.gcode).filter(e => !!e))];
    const units = gcds.length == 0 ? [] : ((await firstValueFrom(this.apollo.query<Pick<DetailQuery, 'msgoods'>>({
      query: GetUnit, fetchPolicy: 'network-only', variables: { id: id, gcds: gcds }
    }))).data as Pick<DetailQuery, 'msgoods'>).msgoods;
    const detail: DetailResult = {
      trjyuden: q.trjyuden.map(j => ({
        ...j,
        trjyumeis: q.trjyumei.filter(m => m.denno == j.denno)
          .map(m => ({ ...m, unit: units.find(u => u.gcode == m.gcode)?.unit ?? null }))
      })),
      trnyuden: q.trnyuden,
      msmember: q.msmember.map(m => ({ ...m, msmadrs: q.msmadr.filter(a => a.mcode == m.mcode) })),
      mssystem: q.mssystem,
      msskoza: q.msskoza
    };
    await this.bunsrv.qryBunrui();

    const result: InvoicePdf[] = [];
    // 件名の社名（「株式会社」を除いた正式社名。現行の件名「マーシャルワールドジャパン○月請求書」に合わせる）
    const corp = (detail.mssystem[0]?.kname ?? '').replace(/株式会社/g, '').replace(/[\s　]/g, '');
    for (const h of head.trseikyu) {
      const doc = this.buildDoc(h, subs.filter(e => e.denno == h.denno), detail);
      const member = detail.msmember.find(e => e.mcode == h.mcode);
      // 現行の Condese_Sp と同じく空白を詰めた請求先名
      const name = (member ? member.sei + (member.mei ?? '') : h.mcode).replace(/[\s　]/g, '');
      const [y, m] = h.sday.split('-');
      const koza = detail.msskoza.find(e => e.code == String(member?.seikyuu ?? '')) ?? detail.msskoza.find(e => e.code == '*');
      const staff = q.msstaff.find(e => e.code == member?.tcode1);
      result.push({
        denno: h.denno,
        mcode: h.mcode,
        name: name,
        fileName: h.denno + name + '様' + y + '年' + Number(m) + '月.pdf',
        blob: await this.pdfsrv.createPdf(doc),
        customerMail: {
          to: member?.mail ?? '',
          from: koza?.mail ?? '',
          subject: corp + Number(m) + '月請求書',
          body: name + ' 様\n\nお世話になっております。\n\n' + Number(m) + '月請求書を添付しておりますのでご査収ください。\n\nよろしくお願いいたします。'
        },
        salesMail: {
          to: staff?.mail ?? '',
          from: '',
          subject: name + '様 請求書確認ください',
          body: 'お疲れ様です\n' + slash(h.sday) + '締分請求書確認ください'
        }
      });
    }
    return result;
  }

  /** 請求先の宛先住所（請求書送付先があればその顧客の、無ければ請求先の、住所枝番 0。無ければ最小の枝番） */
  private address(mcode: string, members: InvMember[]): InvAdr | undefined {
    const member = members.find(e => e.mcode == mcode);
    const to = members.find(e => e.mcode == (member?.sscode || mcode)) ?? member;
    const adrs = to?.msmadrs ?? [];
    return adrs.find(e => e.eda == 0) ?? adrs[0];
  }

  /** 納入先の名前（住所の宛名、無ければ顧客名） */
  private nsaki(ncode: string | null, nadr: number | null, members: InvMember[]): string {
    if (!ncode) {
      return '';
    }
    const member = members.find(e => e.mcode == ncode);
    const adr = member?.msmadrs.find(e => e.eda == (nadr ?? 0));
    const name = adr?.adrname || (member ? member.sei + (member.mei ?? '') : '');
    return name ? name + ' 様' : '';
  }

  private buildDoc(h: InvHead, subs: InvSub[], d: DetailResult): TDocumentDefinitions {
    const member = d.msmember.find(e => e.mcode == h.mcode);
    const adr = this.address(h.mcode, d.msmember);
    const sys: InvSystem = d.mssystem[0] ?? { kname: null, invno: null, zip: null, adr: null, tel: null, fax: null, bank: null, kmeigi: null };
    const koza = d.msskoza.find(e => e.code == String(member?.seikyuu ?? '')) ?? d.msskoza.find(e => e.code == '*');
    const kurikosi = h.kurikosi ?? (Number(h.zenkai) - Number(h.nmon) - Number(h.tmon));

    // 宛先（左）と会社情報（右）
    const to: Content[] = [
      { text: adr?.zip ? '〒' + adr.zip.replace(/^(\d{3})(\d{4})$/, '$1-$2') : '' },
      { text: [adr?.region, adr?.local, adr?.street].filter(e => e).join('') },
      { text: [adr?.extend, adr?.extend2].filter(e => e).join(' ') },
      { text: (member ? member.sei + (member.mei ?? '') : '') + ' 様', fontSize: 13, bold: true, margin: [0, 8, 0, 2] },
      { text: 'お客様コード：' + h.mcode }
    ];
    const from: Content[] = [
      { text: sys.kname ?? '', bold: true, fontSize: 10 },
      { text: sys.invno ? '登録番号：' + sys.invno : '' },
      { text: sys.zip ? '〒' + sys.zip : '' },
      { text: sys.adr ?? '' },
      { text: 'TEL：' + (sys.tel ?? '') + '　FAX：' + (sys.fax ?? '') },
      { text: '振 込 先：' + (sys.bank ?? ''), margin: [0, 4, 0, 0] },
      { text: '　　　　　' + (koza?.koza ?? '') },
      { text: '口座名義：' + (sys.kmeigi ?? '') }
    ];

    // 集計
    const sumHead = ['締 日', '請求№', '前回ご請求額', 'ご入金額', '調整額', '前回繰越額', '今回御買上額', '消費税額', '今回請求額']
      .map(t => ({ text: t, style: 'th' }));
    const sumBody: TableCell[] = [
      { text: slash(h.sday), alignment: 'center' },
      { text: String(h.denno), alignment: 'center' },
      ...[h.zenkai, h.nmon, h.tmon, kurikosi, h.taxmon, h.tax].map(v => ({ text: yen(v), alignment: 'right' as const })),
      { text: yen(h.seikyu), alignment: 'right', bold: true, fillColor: '#fff3c4' }
    ];
    const rateCell = (mon: number | null, tax: number | null): string =>
      Number(mon ?? 0) == 0 && Number(tax ?? 0) == 0 ? '' : yen(mon) + '（' + yen(tax) + '）';

    // 明細
    const rows: DetailRow[] = [];
    let total = 0;
    let nyukin = 0;
    for (const s of subs.filter(e => e.kind == 'J')) {
      const j = d.trjyuden.find(e => e.denno == s.refdenno);
      if (!j) {
        continue;
      }
      // 移行した返品伝票は金額が正で入っているので、請求書ではマイナスにする
      const sign = j.jdstatus == '2' ? -1 : 1;
      const nsaki = this.nsaki(j.ncode, j.nadr, d.msmember);
      let tax = 0;
      j.trjyumeis.forEach((m, i) => {
        const money = sign * Number(m.toutmoney ?? 0);
        tax += sign * Number(m.taxmoney ?? 0);
        total += money;
        rows.push({
          day: s.day, denno: s.refdenno, order: m.line, cells: [
            i == 0 ? s.day.slice(5).replace('-', '/') : '',
            i == 0 ? String(s.refdenno) : '',
            m.gcode ?? '',
            (m.gtext ?? '') + (String(m.taxrate) == '8' ? ' ＊' : ''),
            m.mmemo ?? '',
            i == 0 ? nsaki : '',
            { text: yen(sign * Number(m.suu ?? 0)) + (m.unit ? ' ' + m.unit : ''), alignment: 'right' },
            { text: yen(m.touttanka), alignment: 'right' },
            { text: yen(money), alignment: 'right' },
            ''
          ]
        });
      });
      total += tax;
      rows.push({
        day: s.day, denno: s.refdenno, order: 1e6, cells: [
          j.trjyumeis.length == 0 ? s.day.slice(5).replace('-', '/') : '',
          j.trjyumeis.length == 0 ? String(s.refdenno) : '',
          '', '消費税', '', '', '', '',
          { text: yen(tax), alignment: 'right' }, ''
        ]
      });
    }
    for (const s of subs.filter(e => e.kind == 'N')) {
      const nyudens = d.trnyuden.filter(e => e.denno == s.refdenno);
      const lines = nyudens.length > 0
        ? nyudens
        : [{ line: 1, ptype: null, nmoney: Number(s.nmoney ?? 0), smoney: Number(s.smoney ?? 0), tmoney: Number(s.tmoney ?? 0), mmemo: s.memo }];
      lines.forEach((l, i) => {
        const money = Number(l.nmoney ?? 0) - Number(l.smoney ?? 0);
        const tmoney = Number(l.tmoney ?? 0);
        const ptype = this.bunsrv.kbn['ptype']?.find(e => e.value == l.ptype)?.viewval ?? '';
        if (money != 0 || tmoney == 0) {
          nyukin += money;
          rows.push({
            day: s.day, denno: s.refdenno, order: l.line * 2, cells: [
              i == 0 ? s.day.slice(5).replace('-', '/') : '', i == 0 ? String(s.refdenno) : '',
              '', ptype || '入金', l.mmemo ?? '', '', '', '', '',
              { text: yen(money), alignment: 'right' }
            ]
          });
        }
        if (tmoney != 0) {
          nyukin += tmoney;
          rows.push({
            day: s.day, denno: s.refdenno, order: l.line * 2 + 1, cells: [
              '', '', '', '調整', l.mmemo ?? '', '', '', '', '',
              { text: yen(tmoney), alignment: 'right' }
            ]
          });
        }
      });
    }
    rows.sort((a, b) => a.day.localeCompare(b.day) || a.denno - b.denno || a.order - b.order);

    const detailHead = ['日付', '伝票№', '商品コード', '商品名', '明細備考', '納入先', '数量', '単価', '金額', '入金額']
      .map(t => ({ text: t, style: 'th' }));
    const detailBody: TableCell[][] = rows.length > 0
      ? rows.map(r => r.cells)
      : [[{ text: '今回の御買上・御入金はありません', colSpan: 10, alignment: 'center' }, '', '', '', '', '', '', '', '', '']];
    const detailFoot: TableCell[] = [
      { text: '合計', colSpan: 8, alignment: 'right', bold: true }, '', '', '', '', '', '', '',
      { text: yen(total), alignment: 'right', bold: true },
      { text: yen(nyukin), alignment: 'right', bold: true }
    ];

    return {
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 36],
      info: { title: '請求書 ' + h.denno },
      defaultStyle: { fontSize: 8, lineHeight: 1.15 },
      styles: {
        title: { fontSize: 20, bold: true, alignment: 'center', characterSpacing: 8 },
        th: { bold: true, alignment: 'center', fillColor: '#eeeeee' }
      },
      // 2 ページ目以降は、どの請求書のページか分かるように上部に請求№と請求先を出す
      header: (page: number) => page == 1 ? null : {
        text: '請求書 No.' + h.denno + '　' + (member ? member.sei + (member.mei ?? '') : h.mcode) + ' 様',
        fontSize: 8, margin: [28, 14, 28, 0]
      },
      footer: (page: number, pages: number) => ({ text: page + ' / ' + pages, alignment: 'center', fontSize: 8, margin: [0, 10, 0, 0] }),
      content: [
        { text: '請求書', style: 'title', margin: [0, 0, 0, 12] },
        { columns: [{ width: '*', stack: to }, { width: 230, stack: from }], columnGap: 16 },
        { text: '下記の通り、ご請求申し上げます。なお、振込手数料はご負担ください。', margin: [0, 12, 0, 0] },
        { text: '※お振込みの際、お名前及び上記お客様コードをご入力頂きますようお願い申し上げます。', margin: [0, 0, 0, 6] },
        {
          table: { headerRows: 1, widths: [50, 45, '*', '*', '*', '*', '*', '*', '*'], body: [sumHead, sumBody] },
          layout: { hLineColor: '#888888', vLineColor: '#888888' }
        },
        {
          table: {
            widths: [80, 110, 80, 110],
            body: [[
              { text: '8%対象（消費税）', style: 'th' }, { text: rateCell(h.taxmon8, h.tax8), alignment: 'right' },
              { text: '10%対象（消費税）', style: 'th' }, { text: rateCell(h.taxmon10, h.tax10), alignment: 'right' }
            ]]
          },
          layout: { hLineColor: '#888888', vLineColor: '#888888' },
          margin: [0, 6, 0, 10]
        },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: [24, 38, 52, '*', 52, 58, 34, 36, 42, 42],
            body: [detailHead, ...detailBody, detailFoot]
          },
          layout: {
            hLineWidth: (i: number, node) => (i <= 1 || i >= (node.table.body.length - 1)) ? 0.8 : 0.3,
            vLineWidth: () => 0.3,
            hLineColor: '#888888', vLineColor: '#888888',
            paddingLeft: () => 2, paddingRight: () => 2
          }
        },
        { text: '＊は軽減税率（8%）適用', fontSize: 7, margin: [0, 3, 0, 0] }
      ]
    };
  }
}
