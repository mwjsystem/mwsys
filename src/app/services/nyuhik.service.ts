import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './user.service';

/**
 * 入荷引当: 入荷（仕入）した数量を、同じ商品・同じ倉庫の「発注入荷待ち」（在庫種別 8）の受注明細へ、登録の古い順に引き当てる。
 *
 *   ・引き当てた明細は在庫種別を 1 引当にし、在庫状態詳細（spdet）に「仕入<仕入伝票番号>」を入れる
 *     （在庫照会の引当済に入るので、ほかの受注に取られない）
 *   ・明細の数量に入荷が足りないときは明細を分ける: 入荷分を新しい行（引当）にし、元の行は残りの数量で 8 のまま
 *     （金額は新しい行を数量で計算し、元の行は元の金額からその分を引く。伝票の合計は変わらない）
 *   ・受注明細の在庫状態詳細に発注明細（発注番号_行）を手で結び付けてあるときは、その発注明細の入荷を先に引き当てる。
 *     ほかの発注明細に結び付けてある受注明細は、その発注の入荷を待つ（ほかの入荷は引き当てない）
 *   ・受発注（発注明細に受注伝票番号がある）の入荷は、その受注のためのものなので引き当てない
 *   ・セット商品（数量区分 1）・構成品のある明細は対象にしない（構成品ごとに入荷がそろわないと引き当てられないため）
 *   ・仕入伝票を変更・削除して入荷数が減っても、引き当ては戻さない（受注伝票で在庫種別を手で直す）
 */

/** 引き当てる入荷 1 行（仕入明細。変更のときは増えた分） */
export interface NyukaLine { gcode: string | null; suu: number | string | null; hdenno?: number | null; hline?: number | null }

/** 引き当てた結果 1 件（受注明細ごと） */
export interface NyuhikResult {
  denno: number;
  line: number;
  /** 明細を分けたときの新しい行（引当）。全数を引き当てたときは null */
  newLine: number | null;
  gcode: string;
  /** 引き当てた数 */
  suu: number;
  /** 引き当てたあと、8 発注入荷待ちのまま残った数 */
  rest: number;
}

/** 受注明細（引当の候補） */
interface JmeiRow {
  line: number; gcode: string; gtext: string | null; suu: number; tanka: number | null; toutmoney: number | null; tinmoney: number | null;
  mmemo: string | null; spec: string | null; spdet: string | null; genka: number | null; scode: string | null; sday: string | null;
  tanka1: number | null; money: number | null; mtax: string | null; tgenka: number | null; taxmoney: number | null; taxrate: string | number | null;
  gskbn: string | null; currency: string | null;
  trjyumzais: { eda: number }[];
}
interface JyudenRow { denno: number; trjyumeis: JmeiRow[]; lines: { line: number }[] }

/** 在庫種別: 発注入荷待ち・引当 */
const SPEC_WAIT = '8';
const SPEC_HIKI = '1';
/** 在庫状態詳細の発注明細の結び付け（発注番号_行） */
const LINK_RE = /^\s*(\d+)_(\d+)\s*$/;

@Injectable({
  providedIn: 'root'
})
export class NyuhikService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  /**
   * 仕入伝票の入荷を引き当てる。
   * @param sdenno 仕入伝票番号（引き当てた明細の在庫状態詳細に入れる）
   * @param scode 仕入伝票の倉庫（受注明細の出荷倉庫が同じものだけ引き当てる）
   * @param lines 引き当てる入荷（新規は仕入明細、変更は増えた分）
   */
  async allocate(sdenno: number, scode: string | null, lines: NyukaLine[]): Promise<NyuhikResult[]> {
    const id = this.usrsrv.compid;
    let ls = lines
      .map(l => ({ gcode: String(l.gcode ?? '').trim(), suu: Number(l.suu) || 0, hdenno: Number(l.hdenno) || 0, hline: Number(l.hline) || 0 }))
      .filter(l => l.gcode && l.suu > 0);
    if (!scode || ls.length == 0) {
      return [];
    }

    // 受発注の発注明細（受注伝票番号がある）の入荷は除く
    const hdns = [...new Set(ls.map(l => l.hdenno).filter(d => d > 0))];
    if (hdns.length) {
      const GetH = gql`
        query nyuhik_hat($id: smallint!, $d: [Int!]!) {
          vhatzn(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno line jdenno }
        }`;
      const h = await firstValueFrom(this.apollo.query<{ vhatzn: { denno: number; line: number; jdenno: number | null }[] }>({
        query: GetH, fetchPolicy: 'network-only', variables: { id, d: hdns }
      }));
      if (h.error || !h.data) {
        throw h.error ?? new Error('発注明細を読めませんでした');
      }
      const juhat = new Set(h.data.vhatzn.filter(r => Number(r.jdenno) > 0).map(r => r.denno + '_' + r.line));
      ls = ls.filter(l => !juhat.has(l.hdenno + '_' + l.hline));
    }
    if (ls.length == 0) {
      return [];
    }

    // 商品ごとの入荷数と、発注明細ごとの入荷数（手で結び付けた受注明細を先に引き当てる）
    const pool = new Map<string, number>();
    const byLink = new Map<string, number>();
    for (const l of ls) {
      pool.set(l.gcode, (pool.get(l.gcode) ?? 0) + l.suu);
      if (l.hdenno > 0) {
        const k = l.gcode + '\t' + l.hdenno + '_' + l.hline;
        byLink.set(k, (byLink.get(k) ?? 0) + l.suu);
      }
    }
    const gcodes = [...pool.keys()];

    // 発注入荷待ちの受注明細（未出荷・取消でない受注伝票。受注伝票番号＝登録順、行の順）
    const today = this.usrsrv.formatDate(new Date());
    const meiWhere = {
      _and: [
        { spec: { _eq: SPEC_WAIT } }, { gcode: { _in: gcodes } }, { scode: { _eq: scode } }, { gskbn: { _eq: '0' } },
        { _or: [{ sday: { _is_null: true } }, { sday: { _gt: today } }] },
        { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] }
      ]
    };
    const Get = gql`
      query nyuhik_jmei($id: smallint!, $mw: trjyumei_bool_exp!) {
        trjyuden(where: {id: {_eq: $id}, del: {_eq: false}, _or: [{skbn: {_is_null: true}}, {skbn: {_neq: "1"}}], trjyumeis: $mw}, order_by: {denno: asc}) {
          denno
          trjyumeis(where: $mw, order_by: {line: asc}) {
            line gcode gtext suu tanka toutmoney tinmoney mmemo spec spdet genka scode sday tanka1 money mtax tgenka taxmoney taxrate gskbn currency
            trjyumzais { eda }
          }
          lines: trjyumeis { line }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trjyuden: JyudenRow[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id, mw: meiWhere }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('受注明細を読めませんでした');
    }
    type Cand = { denno: number; m: JmeiRow; left: number; got: number; link: string | null };
    const cands: Cand[] = [];
    const maxLine = new Map<number, number>();
    for (const j of res.data.trjyuden) {
      maxLine.set(j.denno, Math.max(0, ...j.lines.map(x => Number(x.line))));
      for (const m of j.trjyumeis) {
        if (m.trjyumzais.length > 0) {
          continue;
        }
        const mt = LINK_RE.exec(m.spdet ?? '');
        cands.push({ denno: j.denno, m, left: Number(m.suu) || 0, got: 0, link: mt ? mt[1] + '_' + mt[2] : null });
      }
    }
    if (cands.length == 0) {
      return [];
    }

    // 1) 手で結び付けた受注明細へ、その発注明細の入荷を引き当てる
    for (const c of cands) {
      if (!c.link) {
        continue;
      }
      const k = c.m.gcode + '\t' + c.link;
      const q = Math.min(c.left, byLink.get(k) ?? 0, pool.get(c.m.gcode) ?? 0);
      if (q > 0) {
        c.left -= q; c.got += q;
        byLink.set(k, (byLink.get(k) ?? 0) - q);
        pool.set(c.m.gcode, (pool.get(c.m.gcode) ?? 0) - q);
      }
    }
    // 2) 残りの入荷を、結び付けの無い受注明細へ古い順に引き当てる（ほかの発注明細に結び付けた明細はその入荷を待つ）
    for (const c of cands) {
      if (c.link) {
        continue;
      }
      const q = Math.min(c.left, pool.get(c.m.gcode) ?? 0);
      if (q > 0) {
        c.left -= q; c.got += q;
        pool.set(c.m.gcode, (pool.get(c.m.gcode) ?? 0) - q);
      }
    }

    // 受注明細の更新（全数: 在庫種別を引当に／一部: 元の行を残りの数量にし、入荷分の行を足す）
    const spdet = '仕入' + sdenno;
    const updates: object[] = [];
    const inserts: object[] = [];
    const results: NyuhikResult[] = [];
    for (const c of cands.filter(x => x.got > 0)) {
      const m = c.m;
      const where = { id: { _eq: id }, denno: { _eq: c.denno }, line: { _eq: m.line } };
      if (c.left <= 0) {
        updates.push({ where, _set: { spec: SPEC_HIKI, spdet } });
        results.push({ denno: c.denno, line: m.line, newLine: null, gcode: m.gcode, suu: c.got, rest: 0 });
        continue;
      }
      const part = this.calcMoney(m, c.got);
      const nl = (maxLine.get(c.denno) ?? 0) + 1;
      maxLine.set(c.denno, nl);
      updates.push({
        where, _set: {
          suu: c.left,
          money: this.num(m.money) - part.money,
          tgenka: this.num(m.tgenka) - part.tgenka,
          taxmoney: this.num(m.taxmoney) - part.taxmoney,
          toutmoney: this.num(m.toutmoney) - part.toutmoney,
          tinmoney: this.num(m.tinmoney) - part.tinmoney
        }
      });
      inserts.push({
        id, denno: c.denno, line: nl, gcode: m.gcode, gtext: m.gtext, suu: c.got, tanka: m.tanka ?? 0, mmemo: m.mmemo,
        spec: SPEC_HIKI, spdet, genka: m.genka, scode: m.scode, sday: m.sday, tanka1: m.tanka1, mtax: m.mtax, taxrate: m.taxrate,
        gskbn: m.gskbn, currency: m.currency, ...part
      });
      results.push({ denno: c.denno, line: m.line, newLine: nl, gcode: m.gcode, suu: c.got, rest: c.left });
    }
    if (results.length == 0) {
      return [];
    }
    const Upd = gql`
      mutation nyuhik_upd($upd: [trjyumei_updates!]!, $ins: [trjyumei_insert_input!]!) {
        update_trjyumei_many(updates: $upd) { affected_rows }
        insert_trjyumei(objects: $ins) { affected_rows }
      }`;
    const u = await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { upd: updates, ins: inserts } }));
    if (u.error) {
      throw u.error;
    }
    return results;
  }

  /** 引き当てた結果を、画面に出す短い文にする（受注伝票番号-行 商品 引当数（残り）） */
  describe(results: NyuhikResult[]): string[] {
    return results.map(r => '受注' + r.denno + '-' + (r.newLine ?? r.line) + ' ' + r.gcode + ' ' + r.suu + ' 引当'
      + (r.newLine ? '（' + r.line + '行目から分割。' + r.line + '行目の残り ' + r.rest + ' は入荷待ち）' : ''));
  }

  /**
   * 仕入伝票を保存したあとに引き当て、結果を画面に出す（失敗しても仕入伝票は保存済み）。
   * @returns 引き当てた件数
   */
  async allocateAndNotify(sdenno: number, scode: string | null, lines: NyukaLine[]): Promise<number> {
    try {
      const r = await this.allocate(sdenno, scode, lines);
      if (r.length) {
        this.usrsrv.toastNote('入荷を発注入荷待ちの受注明細に引き当てました（仕入' + sdenno + '）', this.describe(r));
      }
      return r.length;
    } catch (e) {
      console.log('error nyuhik', e);
      this.usrsrv.toastErr('入荷引当', '仕入伝票' + sdenno + 'は保存しましたが、発注入荷待ちの受注明細への引き当てができませんでした');
      return 0;
    }
  }

  /**
   * 仕入伝票の変更で増えた入荷（商品・発注明細ごとに 今の数 − 読み込んだときの数。倉庫が変わったときは今の数すべて）。
   * 減った分は引き当てを戻さない
   */
  increase(oldScode: string | null, oldLines: NyukaLine[], scode: string | null, lines: NyukaLine[]): NyukaLine[] {
    const key = (l: NyukaLine) => String(l.gcode ?? '').trim() + '\t' + (Number(l.hdenno) || 0) + '\t' + (Number(l.hline) || 0);
    const sum = new Map<string, NyukaLine & { suu: number }>();
    for (const l of lines) {
      const s = sum.get(key(l)) ?? { ...l, suu: 0 };
      s.suu += Number(l.suu) || 0;
      sum.set(key(l), s);
    }
    if (oldScode == scode) {
      for (const l of oldLines) {
        const s = sum.get(key(l));
        if (s) {
          s.suu -= Number(l.suu) || 0;
        }
      }
    }
    return [...sum.values()].filter(l => l.suu > 0);
  }

  private num(v: number | string | null | undefined): number {
    return Number(v) || 0;
  }

  /** 受注明細の金額（受注明細の画面 jmeitbl.calcMei と同じ計算）。数量 suu の分 */
  private calcMoney(m: JmeiRow, suu: number): { money: number; tgenka: number; taxmoney: number; toutmoney: number; tinmoney: number } {
    const tanka = this.num(m.tanka);
    const money = tanka * suu;
    const r = Number(m.taxrate);
    const rate = (m.taxrate == null || m.taxrate === '' || isNaN(r) ? 10 : r) / 100;
    let taxmoney = 0, toutmoney = money, tinmoney = money;
    switch (String(m.mtax ?? '0')) {
      case '1':
        taxmoney = Math.sign(money) * Math.ceil(Math.round(Math.abs(money) * rate * 100) / Math.round((1 + rate) * 100));
        toutmoney = money - taxmoney;
        tinmoney = money;
        break;
      case '2':
        break;
      default:
        taxmoney = Math.round(tanka * rate) * suu;
        toutmoney = money;
        tinmoney = money + taxmoney;
    }
    return { money, tgenka: Math.round(this.num(m.genka) * suu), taxmoney, toutmoney, tinmoney };
  }
}
