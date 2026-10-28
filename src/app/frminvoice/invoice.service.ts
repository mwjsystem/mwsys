import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 請求伝票（trseikyu、月次締め）のヘッダ */
export class Seikyu {
  denno!: number;
  mcode!: string;
  sday!: string;
  /** 締め期間開始日（現行システムから移行した請求伝票は null） */
  fday!: string | null;
  zenkai: number = 0;
  nmon: number = 0;
  tmon: number = 0;
  kurikosi: number = 0;
  taxmon: number = 0;
  tax: number = 0;
  taxmon8: number = 0;
  tax8: number = 0;
  taxmon10: number = 0;
  tax10: number = 0;
  seikyu: number = 0;
  dencnt: number = 0;
  /** 取消（論理削除）済 */
  del: boolean = false;
  created_at!: Date;
  created_by!: string;
  /** 取消済のときは取消した日時・担当者 */
  updated_at!: Date;
  updated_by!: string;
  constructor(init?: Partial<Seikyu>) {
    Object.assign(this, init);
  }
}

/** 請求伝票に計上した受注伝票の 1 行 */
export interface InvJyuden {
  denno: number;
  uday: string;
  taxmon: number;
  tax: number;
  total: number;
}

/** 請求伝票に計上した請求入金伝票の 1 行 */
export interface InvNyusub {
  denno: number;
  day: string;
  nmoney: number;
  smoney: number;
  tmoney: number;
  memo: string;
}

/** 締め処理の対象（請求先 1 件分の請求伝票案） */
export interface Shime {
  chk: boolean;
  /** 同じ締め日の請求伝票が既にある（作成不可） */
  done: boolean;
  /** より後の締め日の請求伝票がある（作成不可。締めは日付順に行う） */
  later: boolean;
  head: Seikyu;
  jyudens: InvJyuden[];
  nyusubs: InvNyusub[];
}

/** 締め処理の抽出結果 */
export interface ShimeList {
  rows: Shime[];
  /** 未請求の掛伝票があるが、締め日が無い・削除済・対象外の大分類のため除外した請求先（担当者の絞り込みで外れたものは含まない） */
  nosime: string[];
}

/** 抽出クエリで受け取る受注伝票（掛売・未請求） */
interface JyudenRow {
  denno: number;
  scde: string;
  uday: string;
  /** 現行システムの伝票区分（移行データのみ。'2' = 返品で、金額は正の値で入っている） */
  jdstatus: string | null;
  trjyumeis: { taxrate: string; toutmoney: number; taxmoney: number }[];
}
/** 抽出クエリで受け取る請求入金伝票（未計上） */
interface NyusubRow { denno: number; mcode: string; day: string; nmoney: number; smoney: number; tmoney: number; memo: string }
/** 抽出クエリで受け取る請求先（掛売の締め日つき顧客） */
interface MemberRow { mcode: string; sime: number | null; tcode: string | null }
/** 抽出クエリで受け取る各請求先の直近の請求伝票 */
interface LastRow { denno: number; mcode: string; sday: string; seikyu: number }

/** get_shime クエリの結果 */
interface ShimeResult { trjyuden: JyudenRow[]; trnyusub: NyusubRow[]; msmember: MemberRow[]; trseikyu: LastRow[]; later: { mcode: string }[] }
/** 請求明細（trseikyusub）の 1 行。kind = 'J'（受注伝票）/ 'N'（請求入金伝票） */
interface SeisubRow {
  line: number;
  kind: 'J' | 'N';
  refdenno: number;
  day: string;
  taxmon: number | null;
  tax: number | null;
  total: number | null;
  nmoney: number | null;
  smoney: number | null;
  tmoney: number | null;
  memo: string | null;
}
/** 請求明細の登録値 */
type SeisubInput = Omit<SeisubRow, 'line'> & { id: number; denno: number; line: number; created_by: string };

/** get_invoice クエリの結果 */
interface InvoiceResult { trseikyu: Seikyu[]; trseikyusub: SeisubRow[]; clear: { denno: number }[] }
/** ins_seikyu ミューテーションの結果 */
interface InsSeikyuResult { insert_trseikyu: mwI.AffectedRows; insert_trseikyusub: mwI.AffectedRows; update_trjyuden: mwI.AffectedRows; update_trnyusub: mwI.AffectedRows }
/** del_seikyu ミューテーションの結果 */
interface DelSeikyuResult { update_trseikyu: mwI.AffectedRows; update_trjyuden: mwI.AffectedRows; update_trnyusub: mwI.AffectedRows }

/** 照会した請求伝票と、取消可否の判定材料 */
export interface Invoice {
  head: Seikyu;
  jyudens: InvJyuden[];
  nyusubs: InvNyusub[];
  /** 取消できない理由（取消できるときは空文字） */
  lock: string;
}

/** 削除済みでない行（del が null か false） */
const NOT_DEL = { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] };

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  total: number = 0;
  mode: number = 3;

  /** 'yyyy-mm-dd' を日付（ローカル時刻 0 時）にする */
  toDate(day: string): Date {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** 月末日か */
  isLastDay(day: Date): boolean {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getDate() == 1;
  }

  /** 顧客マスタの締め日（sime、末日は 29 以上 = 99）が、指定の締め日に該当するか */
  matchSime(sime: number | null, sday: Date): boolean {
    if (sime == null || sime <= 0) {
      return false;
    }
    return sime == sday.getDate() || (this.isLastDay(sday) && sime > sday.getDate());
  }

  /** 締め日 sime の顧客について、締め日 sday の前回締め日の翌日（締め期間開始日） */
  firstDay(sime: number, sday: Date): Date {
    const lastOfPrev = new Date(sday.getFullYear(), sday.getMonth(), 0).getDate();
    const prev = new Date(sday.getFullYear(), sday.getMonth() - 1, Math.min(sime, lastOfPrev));
    prev.setDate(prev.getDate() + 1);
    return prev;
  }

  /** 締め日の初期値（現行の締め処理と同じ：1～10日→前月末、11～20日→10日、21～25日→20日、26日～→25日） */
  defaultSday(today: Date = new Date()): Date {
    const d = today.getDate();
    if (d <= 10) {
      return new Date(today.getFullYear(), today.getMonth(), 0);
    }
    return new Date(today.getFullYear(), today.getMonth(), d <= 20 ? 10 : d <= 25 ? 20 : 25);
  }

  /** 受注明細から税率別の税抜金額・消費税を集計する */
  private sumJyuden(row: JyudenRow): InvJyuden & { taxmon8: number; tax8: number; taxmon10: number; tax10: number } {
    const sum = { denno: row.denno, uday: row.uday, taxmon: 0, tax: 0, total: 0, taxmon8: 0, tax8: 0, taxmon10: 0, tax10: 0 };
    // 移行した返品伝票は金額が正で入っているので、請求ではマイナスにする（現行の請求書と同じ）
    const sign = row.jdstatus == '2' ? -1 : 1;
    for (const m of row.trjyumeis) {
      const out = sign * Number(m.toutmoney ?? 0);
      const tax = sign * Number(m.taxmoney ?? 0);
      sum.taxmon += out;
      sum.tax += tax;
      if (m.taxrate == '8') {
        sum.taxmon8 += out;
        sum.tax8 += tax;
      } else if (m.taxrate == '10') {
        sum.taxmon10 += out;
        sum.tax10 += tax;
      }
    }
    sum.total = sum.taxmon + sum.tax;
    return sum;
  }

  private toNyusub(row: NyusubRow): InvNyusub {
    return {
      denno: row.denno,
      day: row.day,
      nmoney: Number(row.nmoney ?? 0),
      smoney: Number(row.smoney ?? 0),
      tmoney: Number(row.tmoney ?? 0),
      memo: row.memo
    };
  }

  /**
   * 締め日 sday で請求伝票を作成する対象を抽出する。
   * 対象は顧客マスタの締め日が sday に該当する請求先（削除済・大分類が 2 で始まる顧客は除く。
   * tcode を指定したときは、顧客マスタの担当者が tcode の請求先だけ）で、
   *   ・売上日が締め日以前の、未請求（idenno が null）の掛売受注伝票（torikbn = true）
   *   ・入金日が締め日以前の、未計上（kdenno が null）の請求入金伝票（kubun = 1）
   *   ・直近の請求伝票の今回請求額（＝今回の前回請求額）
   * を集計する。同じ締め日の請求伝票が既にある請求先は done = true（作成不可）。
   */
  async qryShime(sday: Date, tcode: string | null): Promise<ShimeList> {
    const GetShime = gql`
      query get_shime($id: smallint!, $day: date!, $jwhere: trjyuden_bool_exp!, $nwhere: trnyusub_bool_exp!) {
        trjyuden(where: $jwhere, order_by: {uday: asc, denno: asc}) {
          denno
          scde
          uday
          jdstatus
          trjyumeis(where: {_or: [{del: {_is_null: true}}, {del: {_eq: false}}]}) {
            taxrate
            toutmoney
            taxmoney
          }
        }
        trnyusub(where: $nwhere, order_by: {day: asc, denno: asc}) {
          denno
          mcode
          day
          nmoney
          smoney
          tmoney
          memo
        }
        msmember(where: {id: {_eq: $id}, sime: {_is_null: false}, del: {_eq: false}, daibunrui: {_iregex: "^(?!2).*$"}}) {
          mcode
          sime
          tcode
        }
        trseikyu(where: {id: {_eq: $id}, sday: {_lte: $day}, del: {_eq: false}}, distinct_on: mcode, order_by: [{mcode: asc}, {sday: desc}]) {
          denno
          mcode
          sday
          seikyu
        }
        later: trseikyu(where: {id: {_eq: $id}, sday: {_gt: $day}, del: {_eq: false}}, distinct_on: mcode, order_by: {mcode: asc}) {
          mcode
        }
      }`;
    const day = this.usrsrv.formatDate(sday);
    const id = this.usrsrv.compid;
    const { data } = await firstValueFrom(this.apollo.query<ShimeResult>({
      query: GetShime,
      fetchPolicy: 'network-only',
      variables: {
        id: id,
        day: day,
        jwhere: { _and: [{ id: { _eq: id } }, { torikbn: { _eq: true } }, { idenno: { _is_null: true } }, { uday: { _lte: day } }, NOT_DEL] },
        nwhere: { _and: [{ id: { _eq: id } }, { kubun: { _eq: 1 } }, { kdenno: { _is_null: true } }, { day: { _lte: day } }, { del: { _is_null: true } }] }
      }
    }));
    const result = data as ShimeResult;

    // 担当者で絞り込むときも、除外理由の判定（nosime）には全担当者の請求先を使う
    const sime = new Map(result.msmember.filter(e => this.matchSime(e.sime, sday)).map(e => [e.mcode, e.sime]));
    const mine = new Set(result.msmember.filter(e => !tcode || e.tcode == tcode).map(e => e.mcode));
    const valid = new Set(result.msmember.filter(e => (e.sime ?? 0) > 0).map(e => e.mcode));
    const last = new Map(result.trseikyu.map(e => [e.mcode, e]));
    const later = new Set(result.later.map(e => e.mcode));
    const rows = new Map<string, Shime>();
    const nosime = new Set<string>();
    const target = (mcode: string): Shime | undefined => {
      if (!sime.has(mcode) || !mine.has(mcode)) {
        return undefined;
      }
      let row = rows.get(mcode);
      if (row == null) {
        const prev = last.get(mcode);
        const done = prev?.sday == day;
        const fday = prev && !done ? this.toDate(prev.sday) : undefined;
        if (fday) {
          fday.setDate(fday.getDate() + 1);
        }
        row = {
          chk: false,
          done: done,
          later: !done && later.has(mcode),
          head: new Seikyu({
            denno: done ? prev?.denno : 0,
            mcode: mcode,
            sday: day,
            fday: this.usrsrv.formatDate(fday ?? this.firstDay(sime.get(mcode) as number, sday)),
            zenkai: done ? 0 : Number(prev?.seikyu ?? 0),
            seikyu: done ? Number(prev?.seikyu ?? 0) : 0
          }),
          jyudens: [],
          nyusubs: []
        };
        rows.set(mcode, row);
      }
      // 請求済・後の締めありの請求先は一覧に出すだけで、集計はしない
      return row.done || row.later ? undefined : row;
    };

    for (const j of result.trjyuden) {
      if (!valid.has(j.scde)) {
        nosime.add(j.scde);
      }
      const row = target(j.scde);
      if (row) {
        const s = this.sumJyuden(j);
        row.jyudens.push({ denno: s.denno, uday: s.uday, taxmon: s.taxmon, tax: s.tax, total: s.total });
        row.head.taxmon += s.taxmon;
        row.head.tax += s.tax;
        row.head.taxmon8 += s.taxmon8;
        row.head.tax8 += s.tax8;
        row.head.taxmon10 += s.taxmon10;
        row.head.tax10 += s.tax10;
      }
    }
    for (const n of result.trnyusub) {
      const row = target(n.mcode);
      if (row) {
        const e = this.toNyusub(n);
        row.nyusubs.push(e);
        row.head.nmon += e.nmoney - e.smoney;
        row.head.tmon += e.tmoney;
      }
    }
    // 取引が無くても、前回請求額の残っている請求先は請求伝票を作成する
    for (const prev of result.trseikyu) {
      if (Number(prev.seikyu ?? 0) != 0) {
        target(prev.mcode);
      }
    }

    for (const row of rows.values()) {
      if (row.done || row.later) {
        continue;
      }
      const h = row.head;
      h.dencnt = row.jyudens.length;
      h.kurikosi = h.zenkai - h.nmon - h.tmon;
      h.seikyu = h.kurikosi + h.taxmon + h.tax;
      // 今回の取引（受注伝票・入金・調整）がある請求先だけ初期選択する。前回請求額の残高だけの請求先は一覧に出すが未選択
      row.chk = row.jyudens.length > 0 || row.nyusubs.length > 0;
    }
    return {
      rows: [...rows.values()].sort((a, b) => a.head.mcode.localeCompare(b.head.mcode, undefined, { numeric: true })),
      nosime: [...nosime].sort()
    };
  }

  /**
   * 請求伝票を 1 件作成し、請求明細（trseikyusub）に計上した伝票と金額を記録して、
   * 受注伝票（idenno）と請求入金伝票（kdenno）に請求伝票番号を記録する。
   * 1 回のミューテーション（= 1 トランザクション）で行う。
   * 同一請求先・同一締め日の（取消していない）請求伝票は DB の一意インデックス（trseikyu_mcode_sday_key）で作成できない。
   * 操作の記録（tropelog）は DB のトリガーで行う。
   */
  async insSeikyu(row: Shime, denno: number): Promise<InsSeikyuResult> {
    const InsertTran = gql`
      mutation ins_seikyu($obj: [trseikyu_insert_input!]!, $subs: [trseikyusub_insert_input!]!, $id: smallint!, $dno: Int!, $jdnos: [Int!]!, $ndnos: [Int!]!) {
        insert_trseikyu(objects: $obj) {
          affected_rows
        }
        insert_trseikyusub(objects: $subs) {
          affected_rows
        }
        update_trjyuden(where: {id: {_eq: $id}, denno: {_in: $jdnos}, idenno: {_is_null: true}}, _set: {idenno: $dno}) {
          affected_rows
        }
        update_trnyusub(where: {id: {_eq: $id}, denno: {_in: $ndnos}, kubun: {_eq: 1}, kdenno: {_is_null: true}}, _set: {kdenno: $dno}) {
          affected_rows
        }
      }`;
    const h = row.head;
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const subs: SeisubInput[] = [
      ...row.jyudens.map(e => ({
        id: id, denno: denno, line: 0, created_by: by, kind: 'J' as const, refdenno: e.denno, day: e.uday,
        taxmon: e.taxmon, tax: e.tax, total: e.total, nmoney: null, smoney: null, tmoney: null, memo: null
      })),
      ...row.nyusubs.map(e => ({
        id: id, denno: denno, line: 0, created_by: by, kind: 'N' as const, refdenno: e.denno, day: e.day,
        taxmon: null, tax: null, total: null, nmoney: e.nmoney, smoney: e.smoney, tmoney: e.tmoney, memo: e.memo
      }))
    ];
    subs.forEach((e, i) => e.line = i + 1);
    const { data } = await firstValueFrom(this.apollo.mutate<InsSeikyuResult>({
      mutation: InsertTran,
      variables: {
        id: id,
        dno: denno,
        subs: subs,
        jdnos: row.jyudens.map(e => e.denno),
        ndnos: row.nyusubs.map(e => e.denno),
        obj: [{
          id: this.usrsrv.compid,
          denno: denno,
          mcode: h.mcode,
          sday: h.sday,
          fday: h.fday,
          zenkai: h.zenkai,
          nmon: h.nmon,
          tmon: h.tmon,
          kurikosi: h.kurikosi,
          taxmon: h.taxmon,
          tax: h.tax,
          taxmon8: h.taxmon8,
          tax8: h.tax8,
          taxmon10: h.taxmon10,
          tax10: h.tax10,
          seikyu: h.seikyu,
          dencnt: h.dencnt,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code,
          updated_at: new Date(),
          updated_by: this.usrsrv.staff.code
        }]
      }
    }));
    return data as InsSeikyuResult;
  }

  /**
   * 請求伝票を照会する（取消済も含む）。計上した受注伝票・請求入金伝票は、請求登録時点の請求明細（trseikyusub）から表示する。
   * 取消できるかの判定材料も返す。
   */
  async qryInvoice(denno: number): Promise<Invoice | undefined> {
    const GetInvoice = gql`
      query get_invoice($id: smallint!, $dno: Int!) {
        trseikyu(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
          denno
          mcode
          sday
          fday
          zenkai
          nmon
          tmon
          kurikosi
          taxmon
          tax
          taxmon8
          tax8
          taxmon10
          tax10
          seikyu
          dencnt
          del
          created_at
          created_by
          updated_at
          updated_by
        }
        trseikyusub(where: {id: {_eq: $id}, denno: {_eq: $dno}}, order_by: {line: asc}) {
          line
          kind
          refdenno
          day
          taxmon
          tax
          total
          nmoney
          smoney
          tmoney
          memo
        }
        clear: trnyusub(where: {id: {_eq: $id}, kubun: {_eq: 1}, idenno: {_eq: $dno}, del: {_is_null: true}}) {
          denno
        }
      }`;
    const GetLater = gql`
      query get_later($id: smallint!, $mcd: String!, $day: date!) {
        later: trseikyu(where: {id: {_eq: $id}, mcode: {_eq: $mcd}, sday: {_gt: $day}, del: {_eq: false}}, limit: 1) {
          denno
        }
      }`;
    const num = (v: number | null) => Number(v ?? 0);
    const id = this.usrsrv.compid;
    const { data } = await firstValueFrom(this.apollo.query<InvoiceResult>({
      query: GetInvoice,
      fetchPolicy: 'network-only',
      variables: { id: id, dno: denno }
    }));
    const result = data as InvoiceResult;
    if (result.trseikyu.length == 0) {
      return undefined;
    }
    const head = new Seikyu(result.trseikyu[0]);
    let lock = '';
    if (head.del) {
      lock = '取消済です';
    } else {
      const later = await firstValueFrom(this.apollo.query<{ later: { denno: number }[] }>({
        query: GetLater,
        fetchPolicy: 'network-only',
        variables: { id: id, mcd: head.mcode, day: head.sday }
      }));
      if ((later.data as { later: { denno: number }[] }).later.length > 0) {
        lock = 'この請求先には、より後の締め日の請求伝票があります（後の請求伝票から取り消してください）';
      } else if (result.clear.length > 0) {
        lock = 'この請求伝票には請求入金伝票（消込）が登録されています（' + result.clear.map(e => e.denno).join(',') + '）';
      }
    }
    return {
      head: head,
      jyudens: result.trseikyusub.filter(e => e.kind == 'J').map(e => ({
        denno: e.refdenno, uday: e.day, taxmon: num(e.taxmon), tax: num(e.tax), total: num(e.total)
      })),
      nyusubs: result.trseikyusub.filter(e => e.kind == 'N').map(e => ({
        denno: e.refdenno, day: e.day, nmoney: num(e.nmoney), smoney: num(e.smoney), tmoney: num(e.tmoney), memo: e.memo ?? ''
      })),
      lock: lock
    };
  }

  /**
   * 請求伝票を取り消す（論理削除。1 トランザクション）。
   * 請求伝票に del と取消した日時・担当者を記録し、受注伝票の idenno・請求入金伝票の kdenno を未請求に戻す。
   * 請求明細（trseikyusub）はそのまま残し、操作の記録（tropelog）は DB のトリガーで行う。
   */
  async delSeikyu(denno: number): Promise<DelSeikyuResult> {
    const DeleteTran = gql`
      mutation del_seikyu($id: smallint!, $dno: Int!, $uat: timestamptz!, $uby: String!) {
        update_trseikyu(where: {id: {_eq: $id}, denno: {_eq: $dno}, del: {_eq: false}}, _set: {del: true, updated_at: $uat, updated_by: $uby}) {
          affected_rows
        }
        update_trjyuden(where: {id: {_eq: $id}, idenno: {_eq: $dno}}, _set: {idenno: null}) {
          affected_rows
        }
        update_trnyusub(where: {id: {_eq: $id}, kdenno: {_eq: $dno}}, _set: {kdenno: null}) {
          affected_rows
        }
      }`;
    const { data } = await firstValueFrom(this.apollo.mutate<DelSeikyuResult>({
      mutation: DeleteTran,
      variables: { id: this.usrsrv.compid, dno: denno, uat: new Date(), uby: this.usrsrv.staff.code }
    }));
    return data as DelSeikyuResult;
  }
}
