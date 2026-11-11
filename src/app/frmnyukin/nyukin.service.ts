import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 入金伝票。DB のトリガー（db/20261117_nyukin.sql）と同じ値 */
export const EXTYPE_NYUKIN = '3';

/** 区分: 0 = 都度請求（受注ごと）、1 = 掛売（月締め請求） */
export type NyuKubun = 0 | 1;

/** 入金方法（msbunrui kubun = ptype） */
export const PTYPE = { GENKIN: '1', GINKO: '3', YUBIN: '4', CARD: '11', SAGAWA: '20', KANYU: '21' } as const;

/** 入金明細（trnyuden）の 1 行 */
export interface NyuLine { line: number; ptype: string; nmoney: number; smoney: number; tmoney: number; mmemo: string }

/** 入金伝票（trnyusub と明細） */
export interface NyuSlip {
  kubun: NyuKubun;
  denno: number;
  day: string;
  /** 請求先 */
  mcode: string;
  /** 支払先 */
  code: string;
  tcode: string;
  memo: string;
  /** 受注伝票（都度） */
  jdenno: number | null;
  /** 消込先の請求伝票（掛売） */
  idenno: number | null;
  /** 締め処理で入金額に計上した請求伝票（掛売。入っていれば変更・取消できない） */
  kdenno: number | null;
  del: boolean;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  lines: NyuLine[];
}

/** 受注の入金残（vnyuzan） */
export interface NyuOrder {
  denno: number; day: string | null; uday: string | null; nday: string | null; mcode: string; scde: string; pcode: string | null;
  hcode: string | null; okurino: string | null; total: number; torikbn: boolean | null; daibiki: number | null; tcode: string | null; tcode1?: string | null;
  nyukin: number; shukin: number; chosei: number; nyuzan: number;
}

/** 請求伝票（掛売）の入金残（vseikyuzan） */
export interface NyuInvoice { denno: number; mcode: string; sday: string; seikyu: number; sstatus: number | null; nyukin: number; shukin: number; chosei: number; zan: number }

/** 入金伝票の一覧の 1 行 */
export interface NyuRow { kubun: number; denno: number; day: string; mcode: string; code: string; jdenno: number | null; idenno: number | null; kdenno: number | null; nmoney: number; smoney: number; tmoney: number; memo: string | null; del: boolean | null; tcode: string }

/** 顧客（名前・カナ） */
export interface NyuMember {
  mcode: string; sei: string | null; mei: string | null; kana: string | null;
  /** 内勤担当・営業担当・締め日・入金サイト（分類マスタ site）・入金日 */
  tcode?: string | null; tcode1?: string | null; sime?: number | null; site?: string | null; inday?: number | null;
}

/** 入金の状況（請求額と入金済額から） */
export function nyuState(total: number, zan: number): '未入金' | '一部入金' | '入金済' | '過入金' {
  if (zan < 0) {
    return '過入金';
  }
  if (zan == 0) {
    return '入金済';
  }
  return zan >= total ? '未入金' : '一部入金';
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

/** 取消でない（del が NULL か false。_neq: true だと NULL の行が外れる） */
export const NOT_DEL = { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] };

/**
 * 入金伝票。都度（受注ごと）と掛売（請求先ごと。締め処理で入金額に計上する）の入金伝票の読み書きと、
 * 一括入金・入金テキスト読込・佐川代引消込で使う、入金残のある受注・請求の検索
 */
@Injectable({
  providedIn: 'root'
})
export class NyukinService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);

  private async q<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('データを読めませんでした');
    }
    return res.data as T;
  }

  private async m<T>(mutation: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.mutate<T>({ mutation, variables }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('保存できませんでした');
    }
    return res.data as T;
  }

  // ===================== 入金伝票 =====================
  async load(denno: number): Promise<NyuSlip | null> {
    const Get = gql`
      query get_nyuslip($id: smallint!, $dno: Int!) {
        trnyusub(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
          kubun denno day mcode code tcode memo jdenno idenno kdenno del created_at created_by updated_at updated_by
          trnyudens(order_by: {line: asc}) { line ptype nmoney smoney tmoney mmemo }
        }
      }`;
    type Row = Omit<NyuSlip, 'lines' | 'kubun'> & { kubun: number; trnyudens: NyuLine[] };
    const d = await this.q<{ trnyusub: Row[] }>(Get, { id: this.usrsrv.compid, dno: denno });
    const h = d.trnyusub[0];
    if (!h) {
      return null;
    }
    return {
      kubun: Number(h.kubun) == 1 ? 1 : 0, denno: h.denno, day: String(h.day).slice(0, 10), mcode: h.mcode, code: h.code, tcode: h.tcode,
      memo: h.memo ?? '', jdenno: h.jdenno, idenno: h.idenno, kdenno: h.kdenno, del: !!h.del,
      created_at: h.created_at, created_by: h.created_by, updated_at: h.updated_at, updated_by: h.updated_by,
      lines: h.trnyudens.map(l => ({ line: l.line, ptype: l.ptype, nmoney: num(l.nmoney), smoney: num(l.smoney), tmoney: num(l.tmoney), mmemo: l.mmemo ?? '' }))
    };
  }

  /** 明細の合計（ヘッダに入れる） */
  sums(lines: NyuLine[]): { nmoney: number; smoney: number; tmoney: number } {
    return lines.reduce((a, l) => ({ nmoney: a.nmoney + num(l.nmoney), smoney: a.smoney + num(l.smoney), tmoney: a.tmoney + num(l.tmoney) }), { nmoney: 0, smoney: 0, tmoney: 0 });
  }

  private head(s: NyuSlip, now: Date, by: string) {
    return {
      kubun: s.kubun, day: s.day, mcode: s.mcode, code: s.code || s.mcode, tcode: s.tcode || by, memo: s.memo || null,
      jdenno: s.kubun == 0 ? s.jdenno : null, idenno: s.kubun == 1 ? s.idenno : null,
      ...this.sums(s.lines), updated_at: now, updated_by: by
    };
  }

  private lineRows(s: NyuSlip, denno: number) {
    return s.lines.map((l, i) => ({
      id: this.usrsrv.compid, kubun: s.kubun, denno, day: s.day, line: i + 1, ptype: l.ptype,
      nmoney: num(l.nmoney), smoney: num(l.smoney), tmoney: num(l.tmoney), mmemo: l.mmemo || null
    }));
  }

  /** 新しい入金伝票番号を n 個とる（連番の最初の番号を返す） */
  private async numbers(n: number): Promise<number> {
    const last = Number(await this.usrsrv.getNumber('ndenno', n));
    if (!last) {
      throw new Error('入金伝票番号を採番できませんでした');
    }
    return last - n + 1;
  }

  /** 保存（denno = 0 は新規。番号をとって登録する）。保存した伝票番号を返す */
  async save(s: NyuSlip): Promise<number> {
    const now = new Date();
    const by = this.usrsrv.staff?.code ?? '';
    const id = this.usrsrv.compid;
    if (!s.denno) {
      const denno = await this.numbers(1);
      const Ins = gql`
        mutation ins_nyuslip($sub: [trnyusub_insert_input!]!, $mei: [trnyuden_insert_input!]!) {
          insert_trnyusub(objects: $sub) { affected_rows }
          insert_trnyuden(objects: $mei) { affected_rows }
        }`;
      await this.m(Ins, { sub: [{ id, denno, ...this.head(s, now, by), created_at: now, created_by: by }], mei: this.lineRows(s, denno) });
      return denno;
    }
    const Upd = gql`
      mutation upd_nyuslip($id: smallint!, $dno: Int!, $set: trnyusub_set_input!, $mei: [trnyuden_insert_input!]!) {
        update_trnyusub(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
        delete_trnyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { affected_rows }
        insert_trnyuden(objects: $mei) { affected_rows }
      }`;
    await this.m(Upd, { id, dno: s.denno, set: this.head(s, now, by), mei: this.lineRows(s, s.denno) });
    return s.denno;
  }

  /** 取消（del = true）と、取消を戻す */
  async setDel(denno: number, del: boolean): Promise<void> {
    const Upd = gql`
      mutation del_nyuslip($id: smallint!, $dno: Int!, $set: trnyusub_set_input!) {
        update_trnyusub(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    await this.m(Upd, { id: this.usrsrv.compid, dno: denno, set: { del, updated_at: new Date(), updated_by: this.usrsrv.staff?.code ?? '' } });
  }

  /**
   * 入金伝票をまとめて登録する（一括入金・入金テキスト読込・佐川代引消込）。明細は 1 行ずつ。
   * 番号はまとめてとる。登録した伝票番号を返す
   */
  async createMany(slips: NyuSlip[]): Promise<number[]> {
    if (slips.length == 0) {
      return [];
    }
    const first = await this.numbers(slips.length);
    const now = new Date();
    const by = this.usrsrv.staff?.code ?? '';
    const id = this.usrsrv.compid;
    const Ins = gql`
      mutation ins_nyumany($sub: [trnyusub_insert_input!]!, $mei: [trnyuden_insert_input!]!) {
        insert_trnyusub(objects: $sub) { affected_rows }
        insert_trnyuden(objects: $mei) { affected_rows }
      }`;
    const dennos = slips.map((_, i) => first + i);
    for (let i = 0; i < slips.length; i += 200) {
      const part = slips.slice(i, i + 200);
      await this.m(Ins, {
        sub: part.map((s, k) => ({ id, denno: dennos[i + k], ...this.head(s, now, by), created_at: now, created_by: by })),
        mei: part.flatMap((s, k) => this.lineRows(s, dennos[i + k]))
      });
    }
    return dennos;
  }

  /** 新しい伝票の雛形 */
  blank(kubun: NyuKubun): NyuSlip {
    return {
      kubun, denno: 0, day: this.usrsrv.formatDate(new Date()), mcode: '', code: '', tcode: this.usrsrv.staff?.code ?? '', memo: '',
      jdenno: null, idenno: null, kdenno: null, del: false, created_at: null, created_by: null, updated_at: null, updated_by: null,
      lines: [{ line: 1, ptype: '', nmoney: 0, smoney: 0, tmoney: 0, mmemo: '' }]
    };
  }

  /** 入金 1 行だけの伝票（一括入金など） */
  simple(kubun: NyuKubun, day: string, mcode: string, ptype: string, money: number, memo: string, ref: { jdenno?: number; idenno?: number }): NyuSlip {
    const s = this.blank(kubun);
    s.day = day;
    s.mcode = mcode;
    s.code = mcode;
    s.memo = memo;
    s.jdenno = ref.jdenno ?? null;
    s.idenno = ref.idenno ?? null;
    s.lines = [{ line: 1, ptype, nmoney: money >= 0 ? money : 0, smoney: money < 0 ? -money : 0, tmoney: 0, mmemo: '' }];
    return s;
  }

  // ===================== 対象（受注・請求） =====================
  private readonly orderFields = 'denno day uday nday mcode scde pcode hcode okurino total torikbn daibiki tcode tcode1 nyukin shukin chosei nyuzan';

  private normOrder(o: NyuOrder): NyuOrder {
    return { ...o, total: num(o.total), nyukin: num(o.nyukin), shukin: num(o.shukin), chosei: num(o.chosei), nyuzan: num(o.nyuzan), daibiki: o.daibiki == null ? null : num(o.daibiki) };
  }

  async order(jdenno: number): Promise<NyuOrder | null> {
    const Get = gql`query get_nyuorder($id: smallint!, $dno: Int!) { vnyuzan(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { ${this.orderFields} } }`;
    const d = await this.q<{ vnyuzan: NyuOrder[] }>(Get, { id: this.usrsrv.compid, dno: jdenno });
    return d.vnyuzan[0] ? this.normOrder(d.vnyuzan[0]) : null;
  }

  /** 受注を条件で探す（一括入金・入金テキスト読込・佐川代引消込） */
  async orders(where: object[], limit = 3000): Promise<NyuOrder[]> {
    const Get = gql`
      query get_nyuorders($where: vnyuzan_bool_exp!, $limit: Int!) {
        vnyuzan(where: $where, order_by: {denno: asc}, limit: $limit) { ${this.orderFields} }
      }`;
    const d = await this.q<{ vnyuzan: NyuOrder[] }>(Get, { where: { _and: [{ id: { _eq: this.usrsrv.compid } }, ...where] }, limit });
    return d.vnyuzan.map(o => this.normOrder(o));
  }

  async invoice(idenno: number): Promise<NyuInvoice | null> {
    const list = await this.invoices([{ denno: { _eq: idenno } }]);
    return list[0] ?? null;
  }

  /** 請求伝票（掛売）を条件で探す */
  async invoices(where: object[], limit = 3000): Promise<NyuInvoice[]> {
    const Get = gql`
      query get_nyuinv($where: vseikyuzan_bool_exp!, $limit: Int!) {
        vseikyuzan(where: $where, order_by: [{sday: desc}, {denno: desc}], limit: $limit) { denno mcode sday seikyu sstatus nyukin shukin chosei zan }
      }`;
    const d = await this.q<{ vseikyuzan: NyuInvoice[] }>(Get, {
      where: { _and: [{ id: { _eq: this.usrsrv.compid } }, NOT_DEL, ...where] }, limit
    });
    return d.vseikyuzan.map(s => ({ ...s, seikyu: num(s.seikyu), nyukin: num(s.nyukin), shukin: num(s.shukin), chosei: num(s.chosei), zan: num(s.zan), sday: String(s.sday).slice(0, 10) }));
  }

  /** 入金伝票の一覧（受注・請求伝票・請求先・期間で） */
  async slips(where: object[], limit = 1000): Promise<NyuRow[]> {
    const Get = gql`
      query get_nyulist($where: trnyusub_bool_exp!, $limit: Int!) {
        trnyusub(where: $where, order_by: [{day: desc}, {denno: desc}], limit: $limit) {
          kubun denno day mcode code jdenno idenno kdenno nmoney smoney tmoney memo del tcode
        }
      }`;
    const d = await this.q<{ trnyusub: NyuRow[] }>(Get, { where: { _and: [{ id: { _eq: this.usrsrv.compid } }, ...where] }, limit });
    return d.trnyusub.map(r => ({ ...r, day: String(r.day).slice(0, 10), nmoney: num(r.nmoney), smoney: num(r.smoney), tmoney: num(r.tmoney) }));
  }

  /** 備考（取込の目印）が既にある入金伝票（二重取込を防ぐ） */
  async memosExist(memos: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    for (let i = 0; i < memos.length; i += 500) {
      const rows = await this.slips([{ memo: { _in: memos.slice(i, i + 500) } }, NOT_DEL], 5000);
      rows.forEach(r => r.memo && set.add(r.memo));
    }
    return set;
  }

  /** 顧客の名前・カナ */
  async members(mcodes: string[]): Promise<Map<string, NyuMember>> {
    const list = [...new Set(mcodes.filter(m => m))];
    const map = new Map<string, NyuMember>();
    const Get = gql`query get_nyumem($id: smallint!, $m: [String!]!) { msmember(where: {id: {_eq: $id}, mcode: {_in: $m}}) { mcode sei mei kana tcode tcode1 sime site inday } }`;
    for (let i = 0; i < list.length; i += 1000) {
      const d = await this.q<{ msmember: NyuMember[] }>(Get, { id: this.usrsrv.compid, m: list.slice(i, i + 1000) });
      d.msmember.forEach(e => map.set(e.mcode, e));
    }
    return map;
  }

  memberName(m: NyuMember | undefined): string {
    return m ? [m.sei, m.mei].filter(e => e).join(' ') : '';
  }
}
