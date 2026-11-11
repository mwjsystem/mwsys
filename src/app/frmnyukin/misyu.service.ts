import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { NyuMember, NyukinService } from './nyukin.service';

/** 対応の状況（trmisyu.status） */
export const MISYU_STATUS = ['対応中', '支払予定', '督促状送付', '回収困難', '取引不可設定', '協賛処理', '完了'] as const;
/** 追いかけを終えた状況（一覧の「対応が要る」から外す） */
export const MISYU_CLOSED = ['協賛処理', '完了'];
/** 回収可能性 */
export const MISYU_KANOU = ['高', '中', '低'] as const;

/** 対応の記録（trmisyu の 1 行） */
export interface MisyuRec {
  sequ?: number;
  kind: 0 | 1;
  denno: number;
  mcode: string;
  renraku: string | null;
  yotei: string | null;
  memo: string;
  tokusoku: string | null;
  kanou: string | null;
  status: string;
  created_at?: string;
  created_by?: string | null;
  /** 記録の数（最新の記録だけ。vmisyulast） */
  cnt?: number;
}

/** 未入金の 1 件（受注か請求伝票と、最新の記録） */
export interface MisyuRow {
  kind: 0 | 1;
  denno: number;
  mcode: string;
  /** 受注: 売上日、請求: 締め日 */
  day: string | null;
  /** 入金予定日（受注: 受注伝票の入金予定日、請求: 請求先の入金サイト・入金日から） */
  due: string | null;
  /** 入金予定日を過ぎた日数 */
  late: number;
  total: number;
  paid: number;
  zan: number;
  pcode: string | null;
  /** 営業担当・内勤担当（受注は受注伝票の担当・担当営業） */
  tcode1: string | null;
  tcode: string | null;
  last: MisyuRec | null;
}

const ymd = (d: Date): string => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/**
 * 未入金管理。入金予定日を過ぎて入金残のある受注（都度）・請求伝票（掛売）を、その場の最新の状態で出し、
 * 1 件ごとに対応の記録（連絡日・経過・支払予定日・督促状送付・回収可能性・状況）を追記していく
 */
@Injectable({
  providedIn: 'root'
})
export class MisyuService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private nyusrv = inject(NyukinService);

  /**
   * 掛売の請求伝票の入金予定日。締め日（請求伝票の締め日）から、請求先の入金サイト（当月・翌月・翌々月・n 日）と入金日（日。末日は 31 以上）で出す。
   * 入金サイトが分からなければ翌月末
   */
  dueOfInvoice(sday: string, m: NyuMember | undefined): string {
    const [y, mo, d] = sday.slice(0, 10).split('-').map(Number);
    const site = ((this.bunsrv.kbn['site'] ?? []) as { value: string; viewval: string }[]).find(e => e.value == String(m?.site ?? ''))?.viewval ?? '';
    const days = site.match(/(\d+)\s*日/);
    if (days && !/月/.test(site)) {
      const t = new Date(y, mo - 1, d);
      t.setDate(t.getDate() + Number(days[1]));
      return ymd(t);
    }
    const add = /翌々/.test(site) ? 2 : /当月/.test(site) ? 0 : 1;
    const day = Number(m?.inday) || 31;
    const last = new Date(y, mo - 1 + add + 1, 0).getDate();
    return ymd(new Date(y, mo - 1 + add, Math.min(day, last)));
  }

  /**
   * 未入金の一覧。kind: 'all' / 0 / 1。from〜to は入金予定日の範囲（to までに入金予定日が来たもの）
   */
  async list(kind: 'all' | 0 | 1, from: string, to: string): Promise<{ rows: MisyuRow[]; members: Map<string, NyuMember> }> {
    const today = new Date();
    const rows: MisyuRow[] = [];
    const notDel = { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] };
    const [orders, invoices] = await Promise.all([
      kind === 1 ? Promise.resolve([]) : this.nyusrv.orders([
        { nyuzan: { _gt: 0 } }, { _or: [{ torikbn: { _is_null: true } }, { torikbn: { _eq: false } }] }, notDel,
        ...(from ? [{ nday: { _gte: from } }] : []), { nday: { _lte: to } }
      ], 5000),
      kind === 0 ? Promise.resolve([]) : this.nyusrv.invoices([{ zan: { _gt: 0 } }, ...(from ? [{ sday: { _gte: from.slice(0, 8) + '01' } }] : [])], 5000)
    ]);
    const members = await this.nyusrv.members([...orders.map(o => o.scde || o.mcode), ...invoices.map(i => i.mcode)]);
    const lateOf = (due: string | null) => due ? Math.floor((today.getTime() - new Date(due + 'T00:00:00').getTime()) / 86400000) : 0;
    for (const o of orders) {
      const due = o.nday ? String(o.nday).slice(0, 10) : null;
      rows.push({
        kind: 0, denno: o.denno, mcode: o.scde || o.mcode, day: o.uday, due, late: lateOf(due), total: o.total, paid: o.total - o.nyuzan, zan: o.nyuzan,
        pcode: o.pcode, tcode1: o.tcode1 ?? null, tcode: o.tcode, last: null
      });
    }
    for (const s of invoices) {
      const m = members.get(s.mcode);
      const due = this.dueOfInvoice(s.sday, m);
      if (due > to || (from && due < from)) {
        continue;
      }
      rows.push({
        kind: 1, denno: s.denno, mcode: s.mcode, day: s.sday, due, late: lateOf(due), total: s.seikyu, paid: s.seikyu - s.zan, zan: s.zan,
        pcode: '1', tcode1: m?.tcode1 ?? null, tcode: m?.tcode ?? null, last: null
      });
    }
    const last = await this.lasts(rows);
    rows.forEach(r => r.last = last.get(r.kind + ':' + r.denno) ?? null);
    return { rows, members };
  }

  /** 最新の記録（受注・請求伝票ごと） */
  private async lasts(rows: { kind: 0 | 1; denno: number }[]): Promise<Map<string, MisyuRec>> {
    const map = new Map<string, MisyuRec>();
    const Get = gql`
      query get_misyulast($where: vmisyulast_bool_exp!) {
        vmisyulast(where: $where) { sequ kind denno mcode renraku yotei memo tokusoku kanou status created_at created_by cnt }
      }`;
    for (const k of [0, 1] as const) {
      const dennos = rows.filter(r => r.kind == k).map(r => r.denno);
      for (let i = 0; i < dennos.length; i += 1000) {
        const res = await firstValueFrom(this.apollo.query<{ vmisyulast: MisyuRec[] }>({
          query: Get, fetchPolicy: 'network-only',
          variables: { where: { _and: [{ id: { _eq: this.usrsrv.compid } }, { kind: { _eq: k } }, { denno: { _in: dennos.slice(i, i + 1000) } }] } }
        }));
        if (res.error || !res.data) {
          throw res.error ?? new Error('対応の記録を読めませんでした');
        }
        res.data.vmisyulast.forEach(e => map.set(e.kind + ':' + e.denno, { ...e, cnt: Number(e.cnt ?? 0) }));
      }
    }
    return map;
  }

  /** 対応の記録（新しい順） */
  async history(kind: 0 | 1, denno: number): Promise<MisyuRec[]> {
    const Get = gql`
      query get_misyu($id: smallint!, $kind: smallint!, $dno: Int!) {
        trmisyu(where: {id: {_eq: $id}, kind: {_eq: $kind}, denno: {_eq: $dno}}, order_by: {sequ: desc}) {
          sequ kind denno mcode renraku yotei memo tokusoku kanou status created_at created_by
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trmisyu: MisyuRec[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, kind, dno: denno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('対応の記録を読めませんでした');
    }
    return res.data.trmisyu;
  }

  /** 対応を記録する（追記） */
  async add(r: MisyuRec): Promise<void> {
    const Ins = gql`mutation ins_misyu($obj: trmisyu_insert_input!) { insert_trmisyu_one(object: $obj) { sequ } }`;
    const res = await firstValueFrom(this.apollo.mutate({
      mutation: Ins,
      variables: {
        obj: {
          id: this.usrsrv.compid, kind: r.kind, denno: r.denno, mcode: r.mcode || null, renraku: r.renraku || null, yotei: r.yotei || null,
          memo: r.memo || null, tokusoku: r.tokusoku || null, kanou: r.kanou || null, status: r.status, created_by: this.usrsrv.staff?.code ?? null
        }
      }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('記録できませんでした');
    }
  }

  /** 対応が要るか（追いかけを終えていない） */
  isOpen(r: MisyuRow): boolean {
    return !r.last || !MISYU_CLOSED.includes(r.last.status);
  }

  /** 支払予定日（期限）を過ぎたか */
  isOverdue(r: MisyuRow, today: string): boolean {
    return !!r.last?.yotei && String(r.last.yotei).slice(0, 10) < today && this.isOpen(r);
  }

  /** 自分の担当か（営業担当・内勤担当） */
  isMine(r: MisyuRow): boolean {
    const me = this.usrsrv.staff?.code;
    return !!me && (r.tcode == me || r.tcode1 == me);
  }
}
