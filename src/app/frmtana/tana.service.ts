import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 棚卸伝票。DB のトリガー（db/20261116_tana.sql）と同じ値 */
export const EXTYPE_TANA = '12';

/** 棚卸で見る商品（商品マスタ） */
export interface TanaGoods { gcode: string; gtext: string; tanano: string; jan: string; unit: string; gskbn: string }

/** 登録済みの棚卸（trgtana の 1 行） */
export interface TanaRec { gcode: string; tana: number; memo: string | null; updated_at: string | null; updated_by: string | null }

/** 一斉棚卸の下書き（trtanaent の 1 行） */
export interface TanaEnt { sequ: number; gcode: string; loc: string | null; suu: number; memo: string | null; done_at: string | null; created_at: string; created_by: string | null }

/** 棚卸集計の 1 行（商品ごと） */
export interface TanaSum {
  gcode: string;
  gtext: string;
  tanano: string;
  /** 下書きの合計（数えていなければ null） */
  count: number | null;
  /** 場所ごとの内訳 */
  ents: TanaEnt[];
  /** システム在庫（その日の終わり、その日の棚卸の前） */
  stock: number;
  /** 登録済みの棚卸数（その日。無ければ null） */
  done: number | null;
}

/**
 * 棚卸。棚卸を登録する = trgtana に（倉庫・商品・日付・棚卸数）を入れる（同じ日・同じ商品は上書き）。
 * 在庫数は trgtana のその日より前の一番新しい棚卸数 + その翌日からの入出庫（DB の関数 fn_tanastock で出す）。
 * 一斉棚卸は、場所ごとに数えた数を下書き（trtanaent）に貯め、棚卸集計で合計して一括確定する
 */
@Injectable({
  providedIn: 'root'
})
export class TanaService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);

  /** 商品コードか JAN から商品を探す（無ければ null） */
  async findGoods(code: string): Promise<TanaGoods | null> {
    const c = code.trim();
    if (!c) {
      return null;
    }
    const Get = gql`
      query get_tanagoods($id: smallint!, $code: String!) {
        msgoods(where: {id: {_eq: $id}, _or: [{gcode: {_eq: $code}}, {jan: {_eq: $code}}]}, limit: 2) {
          gcode gtext tanano jan unit gskbn
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ msgoods: TanaGoods[] }>({
      query: Get, variables: { id: this.usrsrv.compid, code: c }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('商品マスタを読めませんでした');
    }
    const g = res.data.msgoods.find(e => e.gcode == c) ?? res.data.msgoods[0];
    if (!g && c != c.toUpperCase()) {
      // 商品コードは大文字（手入力で小文字のとき）
      return this.findGoods(c.toUpperCase());
    }
    return g ? this.norm(g) : null;
  }

  private norm(g: TanaGoods): TanaGoods {
    return { gcode: g.gcode, gtext: g.gtext ?? '', tanano: g.tanano ?? '', jan: g.jan ?? '', unit: g.unit ?? '', gskbn: g.gskbn ?? '0' };
  }

  /** 在庫品（数量区分 0）の一覧（棚番順・商品コード順で順に送るため） */
  async goodsList(order: 'tanano' | 'gcode'): Promise<TanaGoods[]> {
    const Get = gql`
      query get_tanalist($id: smallint!, $order: [msgoods_order_by!]) {
        msgoods(where: {id: {_eq: $id}, gskbn: {_eq: "0"}, tkbn: {_lt: "9"}}, order_by: $order) {
          gcode gtext tanano jan unit gskbn
        }
      }`;
    const order_by = order == 'tanano' ? [{ tanano: 'asc_nulls_last' }, { gcode: 'asc' }] : [{ gcode: 'asc' }];
    const res = await firstValueFrom(this.apollo.query<{ msgoods: TanaGoods[] }>({
      query: Get, variables: { id: this.usrsrv.compid, order: order_by }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('商品マスタを読めませんでした');
    }
    return res.data.msgoods.map(g => this.norm(g));
  }

  /** システム在庫（その日の終わり、その日の棚卸の前）。gcodes を省くと、その倉庫の全部の商品 */
  async stocks(scode: string, day: string, gcodes?: string[]): Promise<Map<string, number>> {
    const Get = gql`
      query get_tanastock($args: fn_tanastock_args!, $where: tanastock_bool_exp!) {
        fn_tanastock(args: $args, where: $where) { gcode stock }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ fn_tanastock: { gcode: string; stock: number }[] }>({
      query: Get, fetchPolicy: 'network-only',
      variables: {
        args: { p_id: this.usrsrv.compid, p_scode: scode, p_day: day },
        where: gcodes ? { gcode: { _in: gcodes } } : {}
      }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('在庫を読めませんでした');
    }
    return new Map(res.data.fn_tanastock.map(e => [e.gcode, Number(e.stock ?? 0)]));
  }

  /** その日に登録済みの棚卸（gcodes を省くと、その倉庫・日の全部） */
  async records(scode: string, day: string, gcodes?: string[]): Promise<Map<string, TanaRec>> {
    const Get = gql`
      query get_tanarec($where: trgtana_bool_exp!) {
        trgtana(where: $where) { gcode tana memo updated_at updated_by }
      }`;
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }, { scode: { _eq: scode } }, { day: { _eq: day } }];
    if (gcodes) {
      and.push({ gcode: { _in: gcodes } });
    }
    const res = await firstValueFrom(this.apollo.query<{ trgtana: TanaRec[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('棚卸を読めませんでした');
    }
    return new Map(res.data.trgtana.map(e => [e.gcode, { ...e, tana: Number(e.tana) }]));
  }

  /**
   * 棚卸を登録する（同じ倉庫・日・商品は上書き）。rows は 1 件でも、一括確定の多数でもよい（500 件ずつ書く）。
   * 操作ログは DB のトリガーで残る
   */
  async saveTana(scode: string, day: string, rows: { gcode: string; tana: number; memo?: string | null }[]): Promise<void> {
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff?.code ?? null;
    const Save = gql`
      mutation save_tana($del: trgtana_bool_exp!, $objs: [trgtana_insert_input!]!) {
        delete_trgtana(where: $del) { affected_rows }
        insert_trgtana(objects: $objs) { affected_rows }
      }`;
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      const now = new Date();
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Save,
        variables: {
          del: { id: { _eq: id }, scode: { _eq: scode }, day: { _eq: day }, gcode: { _in: part.map(r => r.gcode) } },
          objs: part.map(r => ({
            id, scode, day, gcode: r.gcode, tana: Math.round(Number(r.tana)), memo: r.memo || null,
            created_at: now, created_by: by ?? '', updated_at: now, updated_by: by ?? ''
          }))
        }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('棚卸を登録できませんでした');
      }
    }
  }

  // ===================== 一斉棚卸の下書き =====================
  /** 下書きに足す（場所ごとに数えた数） */
  async addEntry(scode: string, day: string, gcode: string, loc: string, suu: number, memo = ''): Promise<void> {
    const Ins = gql`
      mutation ins_tanaent($obj: trtanaent_insert_input!) { insert_trtanaent_one(object: $obj) { sequ } }`;
    const res = await firstValueFrom(this.apollo.mutate({
      mutation: Ins,
      variables: { obj: { id: this.usrsrv.compid, scode, day, gcode, loc: loc.trim() || null, suu: Math.round(suu), memo: memo || null, created_by: this.usrsrv.staff?.code ?? null } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('下書きに登録できませんでした');
    }
  }

  /** CSV の取込などで、下書きに一度に足す */
  async addEntries(scode: string, day: string, rows: { gcode: string; loc: string; suu: number; memo?: string }[]): Promise<void> {
    const Ins = gql`
      mutation ins_tanaents($objs: [trtanaent_insert_input!]!) { insert_trtanaent(objects: $objs) { affected_rows } }`;
    const by = this.usrsrv.staff?.code ?? null;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Ins,
        variables: {
          objs: rows.slice(i, i + 500).map(r => ({
            id: this.usrsrv.compid, scode, day, gcode: r.gcode, loc: r.loc || null, suu: Math.round(r.suu), memo: r.memo || null, created_by: by
          }))
        }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('下書きに登録できませんでした');
      }
    }
  }

  /** 下書き（その倉庫・日。gcode を指定するとその商品だけ） */
  async entries(scode: string, day: string, gcode?: string): Promise<TanaEnt[]> {
    const Get = gql`
      query get_tanaents($where: trtanaent_bool_exp!) {
        trtanaent(where: $where, order_by: {sequ: asc}) { sequ gcode loc suu memo done_at created_at created_by }
      }`;
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }, { scode: { _eq: scode } }, { day: { _eq: day } }];
    if (gcode) {
      and.push({ gcode: { _eq: gcode } });
    }
    const res = await firstValueFrom(this.apollo.query<{ trtanaent: TanaEnt[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('下書きを読めませんでした');
    }
    return res.data.trtanaent.map(e => ({ ...e, suu: Number(e.suu) }));
  }

  async deleteEntry(sequ: number): Promise<void> {
    const Del = gql`mutation del_tanaent($sequ: bigint!) { delete_trtanaent_by_pk(sequ: $sequ) { sequ } }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Del, variables: { sequ } }));
    if (res.error) {
      throw res.error;
    }
  }

  /**
   * 棚卸集計。下書きを商品ごとに合計し、システム在庫・登録済みの棚卸と並べる。
   * withStock = true は、数えていなくてもシステム在庫がある商品も出す（数え忘れの確認）
   */
  async summary(scode: string, day: string, withStock: boolean): Promise<TanaSum[]> {
    const [ents, stocks, recs] = await Promise.all([this.entries(scode, day), this.stocks(scode, day), this.records(scode, day)]);
    const map = new Map<string, TanaSum>();
    const row = (gcode: string): TanaSum => {
      let r = map.get(gcode);
      if (!r) {
        r = { gcode, gtext: '', tanano: '', count: null, ents: [], stock: stocks.get(gcode) ?? 0, done: recs.get(gcode)?.tana ?? null };
        map.set(gcode, r);
      }
      return r;
    };
    for (const e of ents) {
      const r = row(e.gcode);
      r.count = (r.count ?? 0) + e.suu;
      r.ents.push(e);
    }
    recs.forEach((_, g) => row(g));
    if (withStock) {
      stocks.forEach((n, g) => {
        if (n != 0) {
          row(g);
        }
      });
    }
    // 商品名・棚番
    const gcodes = [...map.keys()];
    const Get = gql`
      query get_tanagoods_in($id: smallint!, $gcodes: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) { gcode gtext tanano }
      }`;
    for (let i = 0; i < gcodes.length; i += 1000) {
      const res = await firstValueFrom(this.apollo.query<{ msgoods: { gcode: string; gtext: string | null; tanano: string | null }[] }>({
        query: Get, variables: { id: this.usrsrv.compid, gcodes: gcodes.slice(i, i + 1000) }
      }));
      for (const g of res.data?.msgoods ?? []) {
        const r = map.get(g.gcode)!;
        r.gtext = g.gtext ?? '';
        r.tanano = g.tanano ?? '';
      }
    }
    return [...map.values()];
  }

  /** 下書きを一括確定した印（done_at）を付ける */
  async markDone(scode: string, day: string, gcodes: string[]): Promise<void> {
    const Upd = gql`
      mutation done_tanaent($where: trtanaent_bool_exp!, $at: timestamptz!) {
        update_trtanaent(where: $where, _set: {done_at: $at}) { affected_rows }
      }`;
    for (let i = 0; i < gcodes.length; i += 1000) {
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Upd,
        variables: {
          where: { _and: [{ id: { _eq: this.usrsrv.compid } }, { scode: { _eq: scode } }, { day: { _eq: day } }, { gcode: { _in: gcodes.slice(i, i + 1000) } }] },
          at: new Date()
        }
      }));
      if (res.error) {
        throw res.error;
      }
    }
  }
}
