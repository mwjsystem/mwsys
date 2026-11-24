import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { VendsService } from './../mstvendor/vends.service';
import { HatmeiService, HatdenNew, HatmeiInput, HatuZaiko } from './../frmsupply/hatmei.service';
import { HatzIn, SyukIn } from './kankoku-calc';

/** data シートの 1 行（発注日・入荷予定日・仕入先コード・商品・数量） */
export interface OrderLine { row: number; day: string; yday: string; vcode: string; code: string; gcode: string; scode: string; suu: number }

/** 登録する発注伝票 1 枚（仕入先・倉庫・発注日ごと） */
export interface OrderSlip {
  vcode: string; vname: string; scode: string; day: string; currency: string;
  lines: (OrderLine & { gtext: string; genka: number; taxrate: string; money: number })[];
  gtotal: number; tax: number;
}

/** 商品マスタの名称・最新の原価 */
interface GoodTanka { gcode: string; gtext: string | null; msgtankas: { genka: number | null; taxrate: string | null }[] }

const num = (v: unknown): number => Number(v ?? 0) || 0;
const day10 = (v: unknown): string => v == null ? '' : String(v).slice(0, 10);

/** 発注伝票のメモ（二重登録の確認にも使う） */
export const DMEMO_PREFIX = '発注勧告から作成';

/**
 * 発注勧告（現行の【原本】発注勧告.xlsm の Span マクロの DB 読み込みと、発注取込.csv の置き換え）。
 * DB の関数は db/20261124_hatkankoku.sql（在庫は db/20261124_chusyutsu.sql の fzaikosc）
 */
@Injectable({
  providedIn: 'root'
})
export class KankokuService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);
  private vensrv = inject(VendsService);
  private hmisrv = inject(HatmeiService);

  private async run<T>(query: ReturnType<typeof gql>, variables: Record<string, unknown>, what: string): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, ...variables } }));
    if (res.error || !res.data) {
      throw res.error ?? new Error(what + 'を読めませんでした');
    }
    return res.data as T;
  }

  /** 期間の出荷数（商品 × 倉庫。出荷 syuk だけ） */
  async syuk(from: string, to: string): Promise<SyukIn[]> {
    const Get = gql`
      query kankoku_syuk($id: smallint!, $from: date!, $to: date!) {
        fsyukscm(args: {p_id: $id, p_from: $from, p_to: $to}) { gcode scode suu }
      }`;
    const d = await this.run<{ fsyukscm: SyukIn[] }>(Get, { from, to }, '出荷数');
    return d.fsyukscm.map(r => ({ gcode: r.gcode, scode: (r.scode ?? '').trim(), suu: num(r.suu) }));
  }

  /** 全倉庫の発注残の明細 */
  async hatz(from: string): Promise<HatzIn[]> {
    const Get = gql`
      query kankoku_hatz($id: smallint!, $from: date!) {
        fhatzall(args: {p_id: $id, p_from: $from}) { day scode gcode yday suu hatzn }
      }`;
    const d = await this.run<{ fhatzall: HatzIn[] }>(Get, { from }, '発注残');
    return d.fhatzall.map(r => ({ day: day10(r.day), scode: (r.scode ?? '').trim(), gcode: r.gcode, yday: day10(r.yday), suu: num(r.suu), hatzn: num(r.hatzn) }));
  }

  /** 商品コード → 名称・発注日より前の最新の原価と税率（多いときは分けて読む） */
  async goods(codes: string[], day: string): Promise<Map<string, { gtext: string; genka: number; taxrate: string }>> {
    const Get = gql`
      query kankoku_goods($id: smallint!, $codes: [String!]!, $day: date!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $codes}}) {
          gcode gtext
          msgtankas(limit: 1, where: {day: {_lt: $day}}, order_by: {day: desc_nulls_last}) { genka taxrate }
        }
      }`;
    const ret = new Map<string, { gtext: string; genka: number; taxrate: string }>();
    for (let i = 0; i < codes.length; i += 500) {
      const d = await this.run<{ msgoods: GoodTanka[] }>(Get, { codes: codes.slice(i, i + 500), day }, '商品');
      d.msgoods.forEach(g => ret.set(g.gcode, { gtext: g.gtext ?? '', genka: num(g.msgtankas[0]?.genka), taxrate: String(g.msgtankas[0]?.taxrate ?? '10') }));
    }
    return ret;
  }

  /** 同じ発注日に、発注勧告から作った発注伝票（二重登録の確認） */
  async madeOn(days: string[]): Promise<{ denno: number; day: string; vcode: string }[]> {
    const Get = gql`
      query kankoku_made($id: smallint!, $days: [date!]!, $memo: String!) {
        trhatden(where: {id: {_eq: $id}, day: {_in: $days}, dmemo: {_like: $memo}}, order_by: {denno: asc}) { denno day vcode }
      }`;
    const d = await this.run<{ trhatden: { denno: number; day: string; vcode: string }[] }>(Get, { days, memo: DMEMO_PREFIX + '%' }, '発注伝票');
    return d.trhatden.map(h => ({ denno: h.denno, day: day10(h.day), vcode: (h.vcode ?? '').trim() }));
  }

  /**
   * data シートの行を、仕入先・倉庫・発注日ごとの発注伝票にまとめる。
   * 原価は発注日より前の最新の単価マスタ。商品・仕入先が無い行は errors に入れる
   */
  async slips(lines: OrderLine[]): Promise<{ slips: OrderSlip[]; errors: string[] }> {
    const errors: string[] = [];
    if (this.vensrv.vends.length == 0) {
      await this.vensrv.getVendors();
    }
    const days = [...new Set(lines.map(l => l.day))];
    const goods = new Map<string, { gtext: string; genka: number; taxrate: string }>();
    for (const d of days) {
      const m = await this.goods([...new Set(lines.filter(l => l.day == d).map(l => l.gcode))], d);
      m.forEach((v, k) => goods.set(d + '|' + k, v));
    }
    const groups = new Map<string, OrderSlip>();
    for (const l of lines) {
      const vend = this.vensrv.getVendor(l.vcode);
      const g = goods.get(l.day + '|' + l.gcode);
      if (!vend.name) {
        errors.push(l.row + ' 行目: 仕入先コード ' + l.vcode + ' が仕入先マスタにありません（' + l.code + '）');
        continue;
      }
      if (!g) {
        errors.push(l.row + ' 行目: 商品コード ' + l.gcode + ' が商品マスタにありません');
        continue;
      }
      const k = l.vcode + '\t' + l.scode + '\t' + l.day;
      const s = groups.get(k) ?? { vcode: l.vcode, vname: vend.name, scode: l.scode, day: l.day, currency: vend.currency || 'JPY', lines: [], gtotal: 0, tax: 0 };
      const money = g.genka * l.suu;
      s.lines.push({ ...l, gtext: g.gtext, genka: g.genka, taxrate: g.taxrate, money });
      s.gtotal += money;
      if ((vend.mtax ?? '0') == '0') {
        s.tax += money * Number(g.taxrate) / 100;
      }
      groups.set(k, s);
    }
    const slips = [...groups.values()].sort((a, b) => a.vcode < b.vcode ? -1 : a.vcode > b.vcode ? 1 : a.scode < b.scode ? -1 : 1);
    return { slips, errors };
  }

  /** 発注伝票を登録する（伝票・明細・在庫の発注数を 1 トランザクションで）。作った伝票番号を返す */
  async register(slips: OrderSlip[], memo: string): Promise<{ denno: number; vcode: string }[]> {
    const now = new Date();
    const by = this.usrsrv.staff.code;
    const id = this.usrsrv.compid;
    const hatden: HatdenNew[] = [];
    const hatmei: HatmeiInput[] = [];
    const zaiko: HatuZaiko[] = [];
    const made: { denno: number; vcode: string }[] = [];
    for (const s of slips) {
      const vend = this.vensrv.getVendor(s.vcode);
      const mtax = vend.mtax || '0';
      const denno = Number(await this.usrsrv.getNumber('hdenno', 1));
      const lines = s.lines.map((l, i) => ({
        id, denno, line: i + 1, day: s.day, inday: null, gcode: l.gcode, gtext: l.gtext, suu: l.suu, genka: l.genka, money: l.money,
        taxrate: l.taxrate, mmemo: '', spec: null, jdenno: null, jline: null, yday: l.yday || null, ydaykbn: l.yday ? '1' : null, mtax
      }) as unknown as HatmeiInput);
      hatmei.push(...lines);
      hatden.push({
        id, denno, vcode: s.vcode, day: s.day, scode: s.scode, tcode: by, autoproc: false,
        dmemo: memo, inmemo: '', gtotal: s.gtotal, tax: s.tax, total: s.gtotal + s.tax,
        currency: s.currency, created_at: now, created_by: by, updated_at: now, updated_by: by,
        hdstatus: this.hmisrv.getHdsta(lines)
      } as unknown as HatdenNew);
      zaiko.push(...this.hmisrv.hatuOf(s.scode, s.day, lines));
      made.push({ denno, vcode: s.vcode });
    }
    await this.hmisrv.insHatden(hatden, hatmei, zaiko);
    return made;
  }
}
