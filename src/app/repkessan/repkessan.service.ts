import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';

/** 売上（月別・税率別）の 1 行。kbn 0 = 10%、1 = 8%、2 = 非課税 */
export interface UriRow { ym: string; kbn: number; cnt: number; gtt: number; neb: number; sor: number; tes: number; tax: number }
/** 都度売掛の 1 行（金額は返品をマイナスにしたもの） */
export interface UrikakeRow {
  denno: number; uday: string; mcode: string; mname: string; pcode: string | null; daibunrui: string | null; tcode: string | null; tcode1: string | null;
  total: number; nyukin: number; chosei: number; zan: number; lastday: string | null; atoday: string | null; atokin: number;
}
/** 入金伝票の手数料（調整額のある明細）の 1 行 */
export interface TesuRow {
  day: string; denno: number; kubun: number; mcode: string; mname: string; jdenno: number | null; idenno: number | null;
  line: number; ptype: string | null; nmoney: number; smoney: number; tmoney: number; mmemo: string; memo: string;
}
/** 在庫の 1 行（期末日の在庫数 > 0） */
export interface ZaikoRow { scode: string; gcode: string; gtext: string; zaiko: number; genka: number; currency: string | null; subcat: string | null; tkbn: string | null }

/** 都度売掛の対象の支払方法（現行の SQL の PCODE IN ('4', '5', '6', '13', '15')） */
export const DEFAULT_PCODES = ['4', '5', '6', '13', '15'];

const num = (v: unknown): number => Number(v ?? 0) || 0;
const day10 = (v: unknown): string => v == null ? '' : String(v).slice(0, 10);

/**
 * 決算資料（現行の「YYYYMMDD決算.xlsx」の売上・在庫金額・都度売掛と、入金伝票の手数料）。
 * 売上・都度売掛・在庫は DB の関数（db/20261205_kessan.sql）で集計し、入金伝票の手数料は入金伝票を直接読む。
 */
@Injectable({
  providedIn: 'root'
})
export class RepkessanService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  async uriage(from: string, to: string): Promise<UriRow[]> {
    const Get = gql`
      query kessan_uri($id: smallint!, $from: date!, $to: date!) {
        fkessan_uri(args: {p_id: $id, p_from: $from, p_to: $to}) { ym kbn cnt gtt neb sor tes tax }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ fkessan_uri: UriRow[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, from, to }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('売上を読めませんでした');
    }
    return res.data.fkessan_uri.map(r => ({
      ym: r.ym, kbn: num(r.kbn), cnt: num(r.cnt), gtt: num(r.gtt), neb: num(r.neb), sor: num(r.sor), tes: num(r.tes), tax: num(r.tax)
    }));
  }

  async urikake(from: string, to: string, pcodes: string[]): Promise<UrikakeRow[]> {
    const Get = gql`
      query kessan_urikake($id: smallint!, $from: date!, $to: date!, $pc: String!) {
        fkessan_urikake(args: {p_id: $id, p_from: $from, p_to: $to, p_pcodes: $pc}, order_by: {denno: asc}) {
          denno uday mcode mname pcode daibunrui tcode tcode1 total nyukin chosei zan lastday atoday atokin
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ fkessan_urikake: UrikakeRow[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, from, to, pc: pcodes.join(',') }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('都度売掛を読めませんでした');
    }
    return res.data.fkessan_urikake.map(r => ({
      ...r, uday: day10(r.uday), lastday: r.lastday ? day10(r.lastday) : null, atoday: r.atoday ? day10(r.atoday) : null,
      total: num(r.total), nyukin: num(r.nyukin), chosei: num(r.chosei), zan: num(r.zan), atokin: num(r.atokin)
    }));
  }

  /** 期間内の入金伝票のうち、調整額（手数料など）のある明細 */
  async tesuryo(from: string, to: string): Promise<TesuRow[]> {
    const Get = gql`
      query kessan_tesu($id: smallint!, $from: date!, $to: date!) {
        trnyusub(where: {id: {_eq: $id}, day: {_gte: $from, _lte: $to}, _not: {del: {_eq: true}}, trnyudens: {tmoney: {_neq: 0}}},
                 order_by: [{day: asc}, {denno: asc}]) {
          kubun denno day mcode jdenno idenno memo
          trnyudens(where: {tmoney: {_neq: 0}}, order_by: {line: asc}) { line ptype nmoney smoney tmoney mmemo }
        }
      }`;
    type Sub = { kubun: number; denno: number; day: string; mcode: string; jdenno: number | null; idenno: number | null; memo: string | null;
      trnyudens: { line: number; ptype: string | null; nmoney: number; smoney: number; tmoney: number; mmemo: string | null }[] };
    const res = await firstValueFrom(this.apollo.query<{ trnyusub: Sub[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, from, to }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('入金伝票を読めませんでした');
    }
    const names = await this.memberNames([...new Set(res.data.trnyusub.map(s => s.mcode).filter(e => e))]);
    return res.data.trnyusub.flatMap(s => s.trnyudens.map(l => ({
      day: day10(s.day), denno: s.denno, kubun: num(s.kubun), mcode: s.mcode, mname: names.get(s.mcode) ?? '', jdenno: s.jdenno, idenno: s.idenno,
      line: l.line, ptype: l.ptype, nmoney: num(l.nmoney), smoney: num(l.smoney), tmoney: num(l.tmoney), mmemo: l.mmemo ?? '', memo: s.memo ?? ''
    })));
  }

  async zaiko(day: string): Promise<ZaikoRow[]> {
    const Get = gql`
      query kessan_zaiko($id: smallint!, $day: date!) {
        fkessan_zaiko(args: {p_id: $id, p_day: $day}, order_by: [{scode: asc}, {gcode: asc}]) { scode gcode gtext zaiko genka currency subcat tkbn }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ fkessan_zaiko: ZaikoRow[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, day }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('在庫を読めませんでした');
    }
    return res.data.fkessan_zaiko.map(r => ({ ...r, gtext: r.gtext ?? '', zaiko: num(r.zaiko), genka: num(r.genka) }));
  }

  /** 倉庫コード → 倉庫名 */
  async stores(): Promise<Map<string, string>> {
    const Get = gql`
      query kessan_store($id: smallint!) {
        msstore(where: {id: {_eq: $id}}) { code name subname }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ msstore: { code: string; name: string | null; subname: string | null }[] }>({
      query: Get, variables: { id: this.usrsrv.compid }
    }));
    return new Map((res.data?.msstore ?? []).map(s => [String(s.code).trim(), s.name || s.subname || String(s.code).trim()]));
  }

  /** 顧客コード → 氏名（多いときは分けて読む） */
  private async memberNames(codes: string[]): Promise<Map<string, string>> {
    const Get = gql`
      query kessan_member($id: smallint!, $codes: [String!]!) {
        msmember(where: {id: {_eq: $id}, mcode: {_in: $codes}}) { mcode sei mei }
      }`;
    const ret = new Map<string, string>();
    for (let i = 0; i < codes.length; i += 500) {
      const res = await firstValueFrom(this.apollo.query<{ msmember: { mcode: string; sei: string | null; mei: string | null }[] }>({
        query: Get, variables: { id: this.usrsrv.compid, codes: codes.slice(i, i + 500) }
      }));
      (res.data?.msmember ?? []).forEach(m => ret.set(m.mcode, [m.sei, m.mei].filter(e => e).join(' ')));
    }
    return ret;
  }
}
