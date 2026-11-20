import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';

/** 団体（msroyorg） */
export interface RoyOrg {
  org: string; seq: number; name: string;
  dest: string | null; dest2: string | null; regno: string | null;
  bank: string | null; bank2: string | null; tanto: string | null; greet: string | null; memo: string | null;
}
/** 集計する商品（msroyitem） */
export interface RoyItem {
  grp: string | null; seq: number; name: string | null; size: string | null; color: string | null;
  gcodes: string | null; cond: string | null;
  price: number | null; price2: number | null; price3: number | null; price4: number | null; rate: number | null; memo: string | null;
}
/** 顧客（msroymem） */
export interface RoyMem {
  kind: string; seq: number; aseq: number | null; mcode: string | null; eda: string | null; pcode: string | null;
  name: string | null; memo: string | null;
}
/** 団体のマスタ一式 */
export interface RoyMaster { org: RoyOrg; items: RoyItem[]; mems: RoyMem[] }

/** 受注伝票（集計に使う項目） */
export interface RoyDen {
  denno: number; day: string | null; uday: string | null; sday: string | null; denku: number | null;
  mcode: string | null; scde: string | null; ncode: string | null; nadr: number | null;
  daibunrui: string | null; chubunrui: string | null; pcode: string | null; tcode: string | null; bkcode: string | null;
  dmemo: string | null; nmemo: string | null; cusden: string | null; smemo: string | null;
}
/** 受注明細（伝票つき） */
export interface RoyLine {
  denno: number; line: number; gcode: string; gtext: string | null; suu: number; tanka: number; toutmoney: number;
  mmemo: string | null; sday: string | null;
  den: RoyDen;
  /** 返品（伝票区分 2）は -1 */
  sign: number;
}
/** 顧客の名前とマスタ備考 */
export interface RoyMember { name: string; memo: string }
/** 単価の履歴（新しい順） */
export interface RoyTanka { day: string; tanka2: number | null; tanka3: number | null }
/** 商品（区分と単価の履歴） */
export interface RoyGoods { gkbn: string | null; tankas: RoyTanka[] }

const DEN_FIELDS = 'denno day uday sday denku mcode scde ncode nadr daibunrui chubunrui pcode tcode bkcode dmemo nmemo cusden smemo';
const ORG_FIELDS = 'org seq name dest dest2 regno bank bank2 tanto greet memo';
const ITEM_FIELDS = 'grp seq name size color gcodes cond price price2 price3 price4 rate memo';
const MEM_FIELDS = 'kind seq aseq mcode eda pcode name memo';
const NOT_DEL = { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] };

const num = (v: unknown): number => v == null || v === '' ? 0 : Number(v);
const numOrNull = (v: unknown): number | null => v == null || v === '' ? null : Number(v);

/**
 * ロイヤリティ（現行の各団体のロイヤリティ Excel の置き換え）のデータの読み書き。
 * マスタ（msroyorg / msroyitem / msroymem）と、集計に使う受注伝票・明細・顧客・商品の単価を読む。
 */
@Injectable({
  providedIn: 'root'
})
export class RoyaltyService {
  private usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private apollo = inject(Apollo);

  private async query<T>(query: ReturnType<typeof gql>, variables: Record<string, unknown>): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error) {
      throw res.error;
    }
    return res.data as T;
  }

  /** 団体の一覧 */
  async orgs(): Promise<RoyOrg[]> {
    const Get = gql`
      query roy_orgs($id: smallint!) {
        msroyorg(where: {id: {_eq: $id}}, order_by: {seq: asc}) { ${ORG_FIELDS} }
      }`;
    const q = await this.query<{ msroyorg: RoyOrg[] }>(Get, { id: this.usrsrv.compid });
    return q.msroyorg;
  }

  /** 団体のマスタ一式 */
  async master(org: string): Promise<RoyMaster> {
    const Get = gql`
      query roy_master($id: smallint!, $org: String!) {
        msroyorg(where: {id: {_eq: $id}, org: {_eq: $org}}) { ${ORG_FIELDS} }
        msroyitem(where: {id: {_eq: $id}, org: {_eq: $org}}, order_by: [{seq: asc}, {rid: asc}]) { ${ITEM_FIELDS} }
        msroymem(where: {id: {_eq: $id}, org: {_eq: $org}}, order_by: [{kind: asc}, {seq: asc}, {rid: asc}]) { ${MEM_FIELDS} }
      }`;
    const q = await this.query<{ msroyorg: RoyOrg[]; msroyitem: RoyItem[]; msroymem: RoyMem[] }>(Get, { id: this.usrsrv.compid, org });
    if (q.msroyorg.length == 0) {
      throw new Error('団体 ' + org + ' がマスタにありません');
    }
    const items = q.msroyitem.map(e => ({
      ...e, price: numOrNull(e.price), price2: numOrNull(e.price2), price3: numOrNull(e.price3), price4: numOrNull(e.price4), rate: numOrNull(e.rate)
    }));
    return { org: q.msroyorg[0], items, mems: q.msroymem };
  }

  /** 団体のマスタを保存する（商品・顧客は団体の行を消して入れ直す） */
  async save(m: RoyMaster): Promise<void> {
    const Upd = gql`
      mutation roy_save($id: smallint!, $org: String!, $set: msroyorg_set_input!, $items: [msroyitem_insert_input!]!, $mems: [msroymem_insert_input!]!) {
        update_msroyorg(where: {id: {_eq: $id}, org: {_eq: $org}}, _set: $set) { affected_rows }
        delete_msroyitem(where: {id: {_eq: $id}, org: {_eq: $org}}) { affected_rows }
        delete_msroymem(where: {id: {_eq: $id}, org: {_eq: $org}}) { affected_rows }
        insert_msroyitem(objects: $items) { affected_rows }
        insert_msroymem(objects: $mems) { affected_rows }
      }`;
    const id = this.usrsrv.compid;
    const org = m.org.org;
    const { org: _o, ...set } = m.org;
    const res = await firstValueFrom(this.apollo.mutate({
      mutation: Upd,
      variables: {
        id, org, set,
        items: m.items.map(e => ({ ...e, id, org })),
        mems: m.mems.map(e => ({ ...e, id, org }))
      }
    }));
    if (res.error) {
      throw res.error;
    }
  }

  /**
   * 受注明細（伝票つき）を読む。w は受注伝票の条件、mw は受注明細の条件（どちらも id と取消は付けて読む）
   */
  async lines(w: Record<string, unknown>, mw: Record<string, unknown> = {}): Promise<RoyLine[]> {
    const Get = gql`
      query roy_lines($w: trjyuden_bool_exp!, $mw: trjyumei_bool_exp!) {
        trjyuden(where: $w, order_by: {denno: asc}) {
          ${DEN_FIELDS}
          trjyumeis(where: $mw, order_by: {line: asc}) { line gcode gtext suu tanka toutmoney mmemo sday }
        }
      }`;
    const id = this.usrsrv.compid;
    const q = await this.query<{ trjyuden: (RoyDen & { trjyumeis: Omit<RoyLine, 'denno' | 'den' | 'sign'>[] })[] }>(Get, {
      w: { _and: [{ id: { _eq: id } }, NOT_DEL, w] },
      mw: { _and: [NOT_DEL, mw] }
    });
    const ret: RoyLine[] = [];
    for (const d of q.trjyuden) {
      const { trjyumeis, ...den } = d;
      den.nadr = numOrNull(den.nadr);
      den.denku = numOrNull(den.denku);
      for (const m of trjyumeis) {
        ret.push({
          ...m, gcode: (m.gcode ?? '').trim(), suu: num(m.suu), tanka: num(m.tanka), toutmoney: num(m.toutmoney),
          denno: den.denno, den, sign: den.denku == 2 ? -1 : 1
        });
      }
    }
    return ret;
  }

  /** 顧客の名前とマスタ備考（伝票備考も含める） */
  async members(mcodes: string[]): Promise<Map<string, RoyMember>> {
    const ret = new Map<string, RoyMember>();
    const list = [...new Set(mcodes.filter(e => e))];
    if (list.length == 0) {
      return ret;
    }
    const Get = gql`
      query roy_members($id: smallint!, $mcodes: [String!]!) {
        msmember(where: {id: {_eq: $id}, mcode: {_in: $mcodes}}) { mcode sei mei memo dmemo }
      }`;
    const q = await this.query<{ msmember: { mcode: string; sei: string | null; mei: string | null; memo: string | null; dmemo: string | null }[] }>(
      Get, { id: this.usrsrv.compid, mcodes: list });
    for (const m of q.msmember) {
      ret.set(m.mcode, { name: ((m.sei ?? '') + ' ' + (m.mei ?? '')).trim(), memo: (m.memo ?? '') + '\n' + (m.dmemo ?? '') });
    }
    return ret;
  }

  /** 納品先の都道府県（キーは 顧客コード/枝番） */
  async regions(mcodes: string[]): Promise<Map<string, string>> {
    const ret = new Map<string, string>();
    const list = [...new Set(mcodes.filter(e => e))];
    if (list.length == 0) {
      return ret;
    }
    const Get = gql`
      query roy_regions($id: smallint!, $mcodes: [String!]!) {
        msmadr(where: {id: {_eq: $id}, mcode: {_in: $mcodes}}) { mcode eda region }
      }`;
    const q = await this.query<{ msmadr: { mcode: string; eda: number; region: string | null }[] }>(Get, { id: this.usrsrv.compid, mcodes: list });
    for (const a of q.msmadr) {
      ret.set(a.mcode + '/' + Number(a.eda), a.region ?? '');
    }
    return ret;
  }

  /** 商品の区分と単価の履歴（新しい順） */
  async goods(gcodes: string[]): Promise<Map<string, RoyGoods>> {
    const ret = new Map<string, RoyGoods>();
    const list = [...new Set(gcodes.filter(e => e))];
    if (list.length == 0) {
      return ret;
    }
    const Get = gql`
      query roy_goods($id: smallint!, $gcodes: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
          gcode
          msggroup { gkbn }
          msgtankas(order_by: {day: desc}) { day tanka2 tanka3 }
        }
      }`;
    const q = await this.query<{ msgoods: { gcode: string; msggroup: { gkbn: string | null } | null; msgtankas: RoyTanka[] }[] }>(
      Get, { id: this.usrsrv.compid, gcodes: list });
    for (const g of q.msgoods) {
      ret.set(g.gcode, {
        gkbn: g.msggroup?.gkbn ?? null,
        tankas: g.msgtankas.map(t => ({ day: t.day, tanka2: numOrNull(t.tanka2), tanka3: numOrNull(t.tanka3) }))
      });
    }
    return ret;
  }

  /** 中分類の名前 */
  async chubunruiName(): Promise<(code: string | null) => string> {
    await this.bunsrv.qryBunrui();
    return (code: string | null) => code ? this.bunsrv.getName(code.trim(), 'chubunrui') : '';
  }
}
