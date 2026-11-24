import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';

/** 入荷待ち一覧の 1 行（発注入荷待ちの受注明細 1 行） */
export interface WaitRow {
  denno: number;
  line: number;
  /** 受付日 */
  day: string | null;
  /** 出荷予定日 */
  yday: string | null;
  mcode: string;
  tcode: string | null;
  gcode: string;
  gtext: string | null;
  suu: number;
  scode: string | null;
  /** 在庫状態詳細（そのまま） */
  spdet: string | null;
  /** 割り当てた発注明細。無ければ null（未割当） */
  hdenno: number | null;
  hline: number | null;
  /** 割り当てた発注明細の入荷予定日・区分（0 確定 1 仮確定 2 暫定）・発注残。発注残が無いとき（入荷済など）は null */
  hyday: string | null;
  hydaykbn: string | null;
  hatzn: number | null;
  vcode: string | null;
}

export interface WaitFilter { tcode: string; scode: string; gcode: string; unlinked: boolean }

/** 在庫種別: 発注入荷待ち */
const SPEC_WAIT = '8';
/** 在庫状態詳細の発注明細の結び付け（発注番号_行） */
const LINK_RE = /^\s*(\d+)_(\d+)\s*$/;

/**
 * 入荷待ち一覧：発注入荷待ち（在庫種別 8）の受注明細と、入荷日の確定などで割り当てた発注明細（在庫状態詳細の「発注番号_行」）。
 * 対象は未出荷（出荷日が無いか先の日付）・取消でない受注伝票（入荷引当 nyuhik.service と同じ）
 */
@Injectable({
  providedIn: 'root'
})
export class RepwaitService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  async find(f: WaitFilter): Promise<WaitRow[]> {
    const id = this.usrsrv.compid;
    const today = this.usrsrv.formatDate(new Date());
    const mei: object[] = [
      { spec: { _eq: SPEC_WAIT } },
      { _or: [{ sday: { _is_null: true } }, { sday: { _gt: today } }] },
      { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] }
    ];
    if (f.scode) {
      mei.push({ scode: { _eq: f.scode } });
    }
    if (f.gcode.trim()) {
      mei.push({ gcode: { _ilike: f.gcode.trim() + '%' } });
    }
    const mw = { _and: mei };
    const den: object[] = [
      { id: { _eq: id } }, { del: { _eq: false } },
      { _or: [{ skbn: { _is_null: true } }, { skbn: { _neq: '1' } }] },
      { trjyumeis: mw }
    ];
    if (f.tcode) {
      den.push({ tcode: { _eq: f.tcode } });
    }
    const Get = gql`
      query repwait_jmei($w: trjyuden_bool_exp!, $mw: trjyumei_bool_exp!) {
        trjyuden(where: $w, order_by: {denno: asc}) {
          denno day yday mcode tcode
          trjyumeis(where: $mw, order_by: {line: asc}) { line gcode gtext suu scode spdet }
        }
      }`;
    type Den = { denno: number; day: string | null; yday: string | null; mcode: string; tcode: string | null;
      trjyumeis: { line: number; gcode: string; gtext: string | null; suu: number | string; scode: string | null; spdet: string | null }[] };
    const res = await firstValueFrom(this.apollo.query<{ trjyuden: Den[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { w: { _and: den }, mw }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('受注明細を読めませんでした');
    }
    const d10 = (v: string | null) => (v ? String(v).slice(0, 10) : null);
    let rows: WaitRow[] = [];
    for (const j of res.data.trjyuden) {
      for (const m of j.trjyumeis) {
        const mt = LINK_RE.exec(m.spdet ?? '');
        rows.push({
          denno: j.denno, line: Number(m.line), day: d10(j.day), yday: d10(j.yday), mcode: j.mcode, tcode: j.tcode,
          gcode: m.gcode, gtext: m.gtext, suu: Number(m.suu) || 0, scode: m.scode, spdet: m.spdet,
          hdenno: mt ? Number(mt[1]) : null, hline: mt ? Number(mt[2]) : null,
          hyday: null, hydaykbn: null, hatzn: null, vcode: null
        });
      }
    }
    if (f.unlinked) {
      rows = rows.filter(r => r.hdenno == null);
    }
    await this.addHat(rows);
    return rows;
  }

  /** 割り当てた発注明細の入荷予定日・発注残と、発注伝票の仕入先を入れる */
  private async addHat(rows: WaitRow[]) {
    const hdennos = [...new Set(rows.map(r => r.hdenno).filter((d): d is number => d != null))];
    if (hdennos.length == 0) {
      return;
    }
    const Get = gql`
      query repwait_hat($id: smallint!, $d: [Int!]!) {
        vhatzn(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno line yday ydaykbn hatzn }
        trhatden(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno vcode }
      }`;
    const res = await firstValueFrom(this.apollo.query<{
      vhatzn: { denno: number; line: number; yday: string | null; ydaykbn: string | number | null; hatzn: number | string }[];
      trhatden: { denno: number; vcode: string | null }[];
    }>({ query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, d: hdennos } }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('発注明細を読めませんでした');
    }
    const hat = new Map(res.data.vhatzn.map(h => [h.denno + '_' + h.line, h]));
    const ven = new Map(res.data.trhatden.map(h => [h.denno, h.vcode]));
    for (const r of rows) {
      if (r.hdenno == null) {
        continue;
      }
      r.vcode = ven.get(r.hdenno) ?? null;
      const h = hat.get(r.hdenno + '_' + r.hline);
      if (h) {
        r.hyday = h.yday ? String(h.yday).slice(0, 10) : null;
        r.hydaykbn = h.ydaykbn == null ? null : String(h.ydaykbn);
        r.hatzn = Number(h.hatzn) || 0;
      }
    }
  }
}
