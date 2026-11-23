import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';

/** 倉庫 × 商品 の在庫と受注残 */
export interface StockRow { scode: string; gcode: string; zaiko: number; juzan: number }
/** 発注残の明細 */
export interface HatznRow { denno: number; line: number; day: string; gcode: string; vcode: string; tcode: string; tname: string; yday: string; hatzn: number }
/** 営業担当の売上明細（返品はマイナス） */
export interface SalesRow {
  mcode: string; mname: string; daibunrui: string; chubunrui: string; tcode1: string; denku: number; denno: number; uday: string;
  gcode: string; gtext: string; suu: number; tanka: number; kingaku: number; mmemo: string;
}

const num = (v: unknown): number => Number(v ?? 0) || 0;
const day10 = (v: unknown): string => v == null ? '' : String(v).slice(0, 10);

/**
 * 在庫・発注チェック（現行の 国内発注在庫・残少在庫確認・大会倉庫・竹島さん売上 の画面版）。
 * DB の関数は db/20261124_chusyutsu.sql（バッチ batch/zaiko/reportjob.py と同じもの）
 */
@Injectable({
  providedIn: 'root'
})
export class RepcheckService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  private async run<T>(query: ReturnType<typeof gql>, variables: Record<string, unknown>, what: string): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, ...variables } }));
    if (res.error || !res.data) {
      throw res.error ?? new Error(what + 'を読めませんでした');
    }
    return res.data as T;
  }

  /** 倉庫（複数可）の在庫と受注残 */
  async stock(day: string, scodes: string[]): Promise<StockRow[]> {
    const Get = gql`
      query check_stock($id: smallint!, $day: date!, $sc: String!) {
        fzaikosc(args: {p_id: $id, p_day: $day, p_scodes: $sc}) { scode gcode zaiko juzan }
      }`;
    const d = await this.run<{ fzaikosc: StockRow[] }>(Get, { day, sc: scodes.join(',') }, '在庫');
    return d.fzaikosc.map(r => ({ scode: r.scode, gcode: r.gcode, zaiko: num(r.zaiko), juzan: num(r.juzan) }));
  }

  /** 商品 → {yyyymm: 出荷数}（scode が空なら全倉庫） */
  async syukMonth(from: string, to: string, scode: string): Promise<Map<string, Map<string, number>>> {
    const Get = gql`
      query check_syukmon($id: smallint!, $from: date!, $to: date!, $sc: String!) {
        fsyukmon(args: {p_id: $id, p_from: $from, p_to: $to, p_scode: $sc}) { gcode ym suu }
      }`;
    const d = await this.run<{ fsyukmon: { gcode: string; ym: string; suu: number }[] }>(Get, { from, to, sc: scode }, '出荷数');
    const ret = new Map<string, Map<string, number>>();
    d.fsyukmon.forEach(r => {
      const m = ret.get(r.gcode) ?? new Map<string, number>();
      m.set(r.ym, num(r.suu));
      ret.set(r.gcode, m);
    });
    return ret;
  }

  /** その日に出荷した商品 → 出荷数 */
  async syukDay(day: string, scode: string): Promise<Map<string, number>> {
    const Get = gql`
      query check_syukday($id: smallint!, $day: date!, $sc: String!) {
        fsyukday(args: {p_id: $id, p_day: $day, p_scode: $sc}) { gcode suu }
      }`;
    const d = await this.run<{ fsyukday: { gcode: string; suu: number }[] }>(Get, { day, sc: scode }, '出荷');
    return new Map(d.fsyukday.map(r => [r.gcode, num(r.suu)]));
  }

  /** 倉庫の発注残の明細 */
  async hatzn(scode: string): Promise<HatznRow[]> {
    const Get = gql`
      query check_hatzmei($id: smallint!, $sc: String!) {
        fhatzmei(args: {p_id: $id, p_scode: $sc}) { denno line day gcode vcode tcode tname yday hatzn }
      }`;
    const d = await this.run<{ fhatzmei: HatznRow[] }>(Get, { sc: scode }, '発注残');
    return d.fhatzmei.map(r => ({ ...r, day: day10(r.day), yday: day10(r.yday), vcode: (r.vcode ?? '').trim(), tname: r.tname ?? '', hatzn: num(r.hatzn) }));
  }

  async sales(from: string, to: string, tcode1: string): Promise<SalesRow[]> {
    const Get = gql`
      query check_sales($id: smallint!, $from: date!, $to: date!, $tc: String!) {
        fsalesdet(args: {p_id: $id, p_from: $from, p_to: $to, p_tcode1: $tc}, order_by: [{mcode: asc}, {uday: asc}, {denno: asc}]) {
          mcode mname daibunrui chubunrui tcode1 denku denno uday gcode gtext suu tanka kingaku mmemo
        }
      }`;
    const d = await this.run<{ fsalesdet: SalesRow[] }>(Get, { from, to, tc: tcode1 }, '売上');
    return d.fsalesdet.map(r => ({
      ...r, mname: r.mname ?? '', daibunrui: r.daibunrui ?? '', chubunrui: r.chubunrui ?? '', gtext: r.gtext ?? '', mmemo: r.mmemo ?? '',
      uday: day10(r.uday), denku: num(r.denku), suu: num(r.suu), tanka: num(r.tanka), kingaku: num(r.kingaku)
    }));
  }

  /** 商品コード → 商品名・中止区分・在庫管理区分（多いときは分けて読む） */
  async goods(codes: string[]): Promise<Map<string, { gtext: string; tkbn: string; zkbn: string }>> {
    const Get = gql`
      query check_goods($id: smallint!, $codes: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $codes}}) { gcode gtext tkbn zkbn }
      }`;
    const ret = new Map<string, { gtext: string; tkbn: string; zkbn: string }>();
    for (let i = 0; i < codes.length; i += 500) {
      const d = await this.run<{ msgoods: { gcode: string; gtext: string | null; tkbn: unknown; zkbn: unknown }[] }>(Get, { codes: codes.slice(i, i + 500) }, '商品');
      d.msgoods.forEach(g => ret.set(g.gcode, { gtext: g.gtext ?? '', tkbn: String(g.tkbn ?? '').trim(), zkbn: String(g.zkbn ?? '').trim() }));
    }
    return ret;
  }
}

/** 前月までの n か月（初日、末日、yyyymm の並び）。バッチの last_months と同じ */
export function lastMonths(today: Date, n = 12): { from: string; to: string; yms: string[] } {
  const ymd = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  const start = new Date(end.getFullYear(), end.getMonth() - n + 1, 1);
  const yms: string[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    yms.push(d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return { from: ymd(start), to: ymd(end), yms };
}
