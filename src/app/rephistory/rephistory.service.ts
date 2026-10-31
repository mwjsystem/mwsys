import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';

/** fjyuhist の 1 行（伝票の項目 + 明細の項目） */
export interface HistRow {
  denno: number; day: string | null; sday: string | null; uday: string | null;
  line: number; gcode: string; gtext: string | null; suu: number | null; unit: string | null; money: number | null;
  mtax: string | null; kkr: number | null; tanka: number | null; taxrate: string | null; soko: string | null; mmemo: string | null;
  jname: string | null; pname: string | null; cusden: string | null; hname: string | null; okurino: string | null; okurisuu: string | null;
  hday: string | null; htime: string | null; mcode: string | null; nadr: string | null; adrname: string | null;
  tnaikin: string | null; teigyo: string | null; dai: string | null; chu: string | null; sho: string | null;
  dmemo: string | null; nmemo: string | null; omemo: string | null; url: string | null; hit: boolean;
}
/** 伝票ごとにまとめたもの */
export interface HistOrder {
  head: HistRow;
  lines: HistRow[];
  /** 金額の合計 */
  total: number;
  /** 指定した商品の数量の合計 */
  hitSuu: number;
}
/** 検索条件 */
export interface HistCond { mcode: string; gcode: string; from: Date; to: Date }

/** 1 回に出す伝票数の上限 */
export const HIST_LIMIT = 3000;

const iso = (d: Date): string => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

/** 受注履歴（現行の「LST-HIST.xlsm」の置き換え）。検索は DB の関数 fjyuhist が行う */
@Injectable({
  providedIn: 'root'
})
export class RephistoryService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  /** 条件に合う伝票（受付日の古い順）。上限を超えたら新しい伝票から HIST_LIMIT 件 */
  async search(c: HistCond): Promise<{ orders: HistOrder[]; over: boolean }> {
    const Get = gql`
      query get_jyuhist($id: smallint!, $mcode: String!, $gcode: String!, $from: date!, $to: date!, $limit: Int!) {
        fjyuhist(args: {p_id: $id, p_mcode: $mcode, p_gcode: $gcode, p_from: $from, p_to: $to, p_limit: $limit},
                 order_by: [{day: asc}, {denno: asc}, {line: asc}]) {
          denno day sday uday line gcode gtext suu unit money mtax kkr tanka taxrate soko mmemo
          jname pname cusden hname okurino okurisuu hday htime mcode nadr adrname
          tnaikin teigyo dai chu sho dmemo nmemo omemo url hit
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ fjyuhist: HistRow[] }>({
      query: Get, fetchPolicy: 'network-only',
      variables: { id: this.usrsrv.compid, mcode: c.mcode, gcode: c.gcode, from: iso(c.from), to: iso(c.to), limit: HIST_LIMIT + 1 }
    }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    const map = new Map<number, HistOrder>();
    for (const r of res.data.fjyuhist as HistRow[]) {
      let o = map.get(r.denno);
      if (!o) {
        o = { head: r, lines: [], total: 0, hitSuu: 0 };
        map.set(r.denno, o);
      }
      o.lines.push(r);
      o.total += Number(r.money ?? 0);
      if (r.hit) {
        o.hitSuu += Number(r.suu ?? 0);
      }
    }
    const orders = [...map.values()];
    const over = orders.length > HIST_LIMIT;
    return { orders: over ? orders.slice(orders.length - HIST_LIMIT) : orders, over };
  }
}
