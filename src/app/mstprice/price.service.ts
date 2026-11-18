import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { TANKA_KEYS, TankaKey } from './../mstgoods/goods-const';

/** 単価の 1 行（msgtanka） */
export type Tanka = Record<TankaKey, number> & {
  day: string; cost: number | null; genka: number | null; taxrate: number | string | null; currency: string | null;
};

/** 価格改定取込で読む、商品マスタの今の状態 */
export interface CurGoods {
  gcode: string;
  code: string;
  gtext: string;
  catpage: number | null;
  /** 適用開始日より前で一番新しい単価（無ければ null） */
  cur: Tanka | null;
  /** 適用開始日と同じ日の単価が既にある（取り込むと上書き） */
  same: boolean;
}

/** 価格改定で書く 1 商品分 */
export interface NewTanka { gcode: string; code: string; tanka: Record<TankaKey, number>; base: Tanka | null }

/** 掛率表で読む 1 商品 */
export interface KakeGoods {
  gcode: string; code: string; gname: string; catpage: number | null; size: string; color: string; gtext: string;
  jan: string; send: string; tkbn: string; tanka: Tanka | null; sptanka: number | null;
}

/** 顧客（掛率表で顧客を指定したとき） */
export interface KakeMember { mcode: string; name: string; tankakbn: string; sptnkbn: string }

const num = (v: unknown) => Number(v ?? 0);
const toTanka = (t: Record<string, unknown>): Tanka => {
  const r = { ...t, day: String(t['day']).slice(0, 10) } as unknown as Tanka;
  TANKA_KEYS.forEach(k => r[k] = num(t[k]));
  return r;
};

/** 商品マスタの価格（価格改定取込・掛率表） */
@Injectable({
  providedIn: 'root'
})
export class PriceService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);

  /** 商品マスタの今の単価（適用開始日より前で一番新しい行）と、同じ日の行があるか */
  async current(gcodes: string[], day: string): Promise<Map<string, CurGoods>> {
    const Get = gql`
      query price_current($id: smallint!, $gcodes: [String!]!, $day: date!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
          gcode code gtext
          msggroup { catpage }
          cur: msgtankas(where: {day: {_lt: $day}}, order_by: {day: desc}, limit: 1) {
            day tanka1 tanka2 tanka3 tanka4 tanka5 tanka6 tanka7 tanka8 tanka9 cost genka taxrate currency
          }
          same: msgtankas(where: {day: {_eq: $day}}) { day }
        }
      }`;
    type Row = { gcode: string; code: string; gtext: string | null; msggroup: { catpage: number | null } | null; cur: Record<string, unknown>[]; same: { day: string }[] };
    const map = new Map<string, CurGoods>();
    for (let i = 0; i < gcodes.length; i += 500) {
      const res = await firstValueFrom(this.apollo.query<{ msgoods: Row[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, gcodes: gcodes.slice(i, i + 500), day }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('商品マスタを読めませんでした');
      }
      for (const g of res.data.msgoods) {
        map.set(g.gcode, {
          gcode: g.gcode, code: g.code, gtext: g.gtext ?? '', catpage: g.msggroup?.catpage ?? null,
          cur: g.cur[0] ? toTanka(g.cur[0]) : null, same: g.same.length > 0
        });
      }
    }
    return map;
  }

  /**
   * 価格改定を書く。適用開始日の単価の行を足す（同じ日の行があれば単価だけ上書き）。古い単価は残る。
   * 商品グループの更新者・更新日時（と頁）も書く（操作ログの記録者になる）。300 商品ずつ 1 トランザクション
   */
  async importPrices(day: string, rows: NewTanka[], pages: Map<string, number>, progress?: (done: number) => void): Promise<number> {
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff?.code ?? '';
    const Save = gql`
      mutation import_price($grps: [msggroup_updates!]!, $objs: [msgtanka_insert_input!]!) {
        update_msggroup_many(updates: $grps) { affected_rows }
        insert_msgtanka(objects: $objs, on_conflict: {constraint: msgtanka_pkey,
          update_columns: [tanka1, tanka2, tanka3, tanka4, tanka5, tanka6, tanka7, tanka8, tanka9]}) { affected_rows }
      }`;
    let done = 0;
    for (let i = 0; i < rows.length; i += 300) {
      const part = rows.slice(i, i + 300);
      const now = new Date();
      const codes = [...new Set(part.map(r => r.code))];
      const grps = codes.map(code => {
        const set: Record<string, unknown> = { updated_by: by, updated_at: now };
        if (pages.has(code)) {
          set['catpage'] = pages.get(code);
        }
        return { where: { id: { _eq: id }, code: { _eq: code } }, _set: set };
      });
      const objs = part.map(r => ({
        id, gcode: r.gcode, day, ...r.tanka,
        cost: r.base?.cost ?? 0, genka: r.base?.genka ?? 0, taxrate: r.base?.taxrate ?? 10, currency: r.base?.currency ?? 'JPY'
      }));
      const res = await firstValueFrom(this.apollo.mutate({ mutation: Save, variables: { grps, objs } }));
      if (res.error || !res.data) {
        throw new Error((done ? done + ' 商品まで書きました。' : '') + ((res.error as Error | undefined)?.message ?? '書けませんでした'));
      }
      done += part.length;
      progress?.(done);
    }
    return done;
  }

  /** 顧客（単価区分・特別単価区分） */
  async member(mcode: string): Promise<KakeMember | null> {
    const Get = gql`
      query kake_member($id: smallint!, $mcode: String!) {
        msmember_by_pk(id: $id, mcode: $mcode) { mcode sei mei tankakbn sptnkbn }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ msmember_by_pk: { mcode: string; sei: string | null; mei: string | null; tankakbn: string | null; sptnkbn: string | null } | null }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, mcode }
    }));
    if (res.error) {
      throw res.error;
    }
    const m = res.data?.msmember_by_pk;
    return m ? { mcode: m.mcode, name: (m.sei ?? '') + (m.mei ?? ''), tankakbn: m.tankakbn ?? '', sptnkbn: m.sptnkbn ?? '' } : null;
  }

  /**
   * 掛率表の商品。基準日の単価（基準日以前で一番新しい行）と、特別単価区分を指定したときはその特別単価。
   * paged = true は頁のある（カタログに載っている）グループだけ、noEnd = true は廃盤（中止区分 9）を除く
   */
  async kakeGoods(day: string, sptnkbn: string, paged: boolean, noEnd: boolean): Promise<KakeGoods[]> {
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }];
    if (paged) {
      and.push({ msggroup: { catpage: { _is_null: false } } });
    }
    if (noEnd) {
      and.push({ _or: [{ tkbn: { _is_null: true } }, { tkbn: { _neq: '9' } }] });
    }
    const Get = gql`
      query kake_goods($where: msgoods_bool_exp!, $day: date!, $sp: String!) {
        msgoods(where: $where, order_by: {gcode: asc}) {
          gcode code size color gtext jan send tkbn
          msggroup { name catpage }
          msgtankas(where: {day: {_lte: $day}}, order_by: {day: desc}, limit: 1) {
            day tanka1 tanka2 tanka3 tanka4 tanka5 tanka6 tanka7 tanka8 tanka9 cost genka taxrate currency
          }
          msgsptnks(where: {day: {_lte: $day}, sptnkbn: {_eq: $sp}}, order_by: {day: desc}, limit: 1) { sptanka }
        }
      }`;
    type Row = {
      gcode: string; code: string; size: string | null; color: string | null; gtext: string | null; jan: string | null; send: string | null; tkbn: string | null;
      msggroup: { name: string | null; catpage: number | null } | null; msgtankas: Record<string, unknown>[]; msgsptnks: { sptanka: number | null }[];
    };
    const res = await firstValueFrom(this.apollo.query<{ msgoods: Row[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: and }, day, sp: sptnkbn || '-' }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('商品マスタを読めませんでした');
    }
    return res.data.msgoods.map(g => ({
      gcode: g.gcode, code: g.code, gname: g.msggroup?.name ?? '', catpage: g.msggroup?.catpage ?? null,
      size: g.size ?? '', color: g.color ?? '', gtext: g.gtext ?? '', jan: g.jan ?? '', send: g.send ?? '', tkbn: g.tkbn ?? '',
      tanka: g.msgtankas[0] ? toTanka(g.msgtankas[0]) : null,
      sptanka: g.msgsptnks[0]?.sptanka != null ? Number(g.msgsptnks[0].sptanka) : null
    }));
  }
}
