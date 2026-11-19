import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './user.service';

/**
 * 入荷引当: 発注入荷待ち（在庫種別 8）の受注明細へ、登録の古い順に入荷を割り当てる。対象は同じ商品・同じ倉庫の、
 * 未出荷・取消でない受注明細（受注伝票番号＝登録順、行の順）。2 段階で行う。
 *
 * 1) 入荷日の確定（発注伝票で発注明細の入荷日を「確定」にして保存したとき）: link
 *    ・在庫種別は 8 のまま、在庫状態詳細（spdet）に発注明細（「発注番号_行」）を入れて結び付ける。
 *      受注伝票で、どの発注の入荷（入荷日）を待っているかが分かる。今の在庫数には影響しない
 *    ・結び付ける数は、その発注明細の発注残から、もう結び付いている受注明細の数を引いた分まで
 *    ・手で結び付けた明細（在庫状態詳細に発注番号_行）は動かさない
 * 2) 入荷（仕入伝票の保存）: allocate
 *    ・その発注明細に結び付いた受注明細を先に引き当て、残りを結び付けの無い受注明細へ古い順に引き当てる。
 *      ほかの発注明細に結び付いた受注明細は、その発注の入荷を待つ
 *    ・引き当てた明細は在庫種別を 1 引当にし、在庫状態詳細を「仕入<仕入伝票番号>」にする（在庫照会の引当済に入る）
 *    ・仕入伝票を変更・削除して入荷数が減っても、引き当ては戻さない（受注伝票で在庫種別を手で直す）
 *
 * どちらも、明細の数量に足りないときは明細を分ける: 割り当てた分を新しい行にし、元の行は残りの数量で 8 のまま
 * （金額は新しい行を数量で計算し、元の行は元の金額からその分を引く。伝票の合計は変わらない）。
 * 受発注（発注明細に受注伝票番号がある）の発注・入荷、セット商品（数量区分 1）・構成品のある明細は対象にしない。
 */

/** 引き当てる入荷 1 行（仕入明細。変更のときは増えた分） */
export interface NyukaLine { gcode: string | null; suu: number | string | null; hdenno?: number | null; hline?: number | null }

/** 割り当てた結果 1 件（受注明細ごと） */
export interface NyuhikResult {
  denno: number;
  line: number;
  /** 明細を分けたときの新しい行。全数を割り当てたときは null */
  newLine: number | null;
  gcode: string;
  /** 割り当てた数 */
  suu: number;
  /** 割り当てたあと、結び付け・引当の無い 8 発注入荷待ちのまま残った数 */
  rest: number;
  /** 結び付けた発注明細（発注番号_行）と入荷日（link のとき） */
  hkey?: string;
  yday?: string | null;
}

/** 受注明細（割り当ての候補） */
interface JmeiRow {
  line: number; gcode: string; gtext: string | null; suu: number; tanka: number | null; toutmoney: number | null; tinmoney: number | null;
  mmemo: string | null; spec: string | null; spdet: string | null; genka: number | null; scode: string | null; sday: string | null;
  tanka1: number | null; money: number | null; mtax: string | null; tgenka: number | null; taxmoney: number | null; taxrate: string | number | null;
  gskbn: string | null; currency: string | null;
  trjyumzais: { eda: number }[];
}
interface JyudenRow { denno: number; trjyumeis: JmeiRow[]; lines: { line: number }[] }
/** 候補 1 件。left = まだ割り当てていない数 */
interface Cand { denno: number; m: JmeiRow; left: number; got: number; link: string | null }
/** 発注明細（vhatzn） */
interface HatLine { denno: number; line: number; gcode: string; hatzn: number; jdenno: number | null; yday: string | null; ydaykbn: string | null }

/** 在庫種別: 発注入荷待ち・引当 */
const SPEC_WAIT = '8';
const SPEC_HIKI = '1';
/** 入荷日の区分: 確定 */
const YDAY_KAKUTEI = '0';
/** 在庫状態詳細の発注明細の結び付け（発注番号_行） */
const LINK_RE = /^\s*(\d+)_(\d+)\s*$/;

@Injectable({
  providedIn: 'root'
})
export class NyuhikService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  /**
   * 入荷日を確定した発注明細に、発注入荷待ちの受注明細を古い順に結び付ける（在庫種別は 8 のまま）。
   * @param hdenno 保存した発注伝票番号
   * @param scode 発注伝票の倉庫
   */
  async link(hdenno: number, scode: string | null): Promise<NyuhikResult[]> {
    const id = this.usrsrv.compid;
    if (!scode || !hdenno) {
      return [];
    }
    const hats = (await this.hatLines([hdenno]))
      .filter(h => h.ydaykbn == YDAY_KAKUTEI && h.yday && !(Number(h.jdenno) > 0) && h.hatzn > 0)
      .sort((a, b) => String(a.yday).localeCompare(String(b.yday)) || a.line - b.line);
    if (hats.length == 0) {
      return [];
    }
    const { cands, maxLine } = await this.fetchCands(scode, [...new Set(hats.map(h => h.gcode))]);
    // 発注明細ごとの空き = 発注残 − もう結び付いている受注明細の数
    const cap = new Map<string, number>();
    for (const h of hats) {
      const k = h.denno + '_' + h.line;
      const linked = cands.filter(c => c.link == k).reduce((s, c) => s + c.left, 0);
      cap.set(k, h.hatzn - linked);
    }
    // 結び付けの無い受注明細へ、古い順に（発注明細は入荷日の早い順に）
    const parts = new Map<Cand, { q: number; set: Record<string, string>; hkey: string; yday: string | null }[]>();
    for (const c of cands) {
      if (c.link) {
        continue;
      }
      for (const h of hats) {
        if (h.gcode != c.m.gcode || c.left <= 0) {
          continue;
        }
        const k = h.denno + '_' + h.line;
        const q = Math.min(c.left, cap.get(k) ?? 0);
        if (q > 0) {
          c.left -= q; c.got += q;
          cap.set(k, (cap.get(k) ?? 0) - q);
          const p = parts.get(c) ?? [];
          p.push({ q, set: { spdet: k }, hkey: k, yday: h.yday });
          parts.set(c, p);
        }
      }
    }
    return this.write(id, parts, maxLine);
  }

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
      const juhat = new Set((await this.hatLines(hdns)).filter(r => Number(r.jdenno) > 0).map(r => r.denno + '_' + r.line));
      ls = ls.filter(l => !juhat.has(l.hdenno + '_' + l.hline));
    }
    if (ls.length == 0) {
      return [];
    }

    // 商品ごとの入荷数と、発注明細ごとの入荷数（結び付いた受注明細を先に引き当てる）
    const pool = new Map<string, number>();
    const byLink = new Map<string, number>();
    for (const l of ls) {
      pool.set(l.gcode, (pool.get(l.gcode) ?? 0) + l.suu);
      if (l.hdenno > 0) {
        const k = l.gcode + '\t' + l.hdenno + '_' + l.hline;
        byLink.set(k, (byLink.get(k) ?? 0) + l.suu);
      }
    }
    const { cands, maxLine } = await this.fetchCands(scode, [...pool.keys()]);

    // 1) 結び付いた受注明細へ、その発注明細の入荷を引き当てる
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
    // 2) 残りの入荷を、結び付けの無い受注明細へ古い順に引き当てる（ほかの発注明細に結び付いた明細はその入荷を待つ）
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

    const set = { spec: SPEC_HIKI, spdet: '仕入' + sdenno };
    const parts = new Map<Cand, { q: number; set: Record<string, string> }[]>();
    for (const c of cands.filter(x => x.got > 0)) {
      parts.set(c, [{ q: c.got, set }]);
    }
    return this.write(id, parts, maxLine);
  }

  /** 発注明細（発注残 hatzn・受発注の受注伝票番号・入荷日と区分） */
  private async hatLines(hdennos: number[]): Promise<HatLine[]> {
    const Get = gql`
      query nyuhik_hat($id: smallint!, $d: [Int!]!) {
        vhatzn(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno line gcode hatzn jdenno yday ydaykbn }
      }`;
    const h = await firstValueFrom(this.apollo.query<{ vhatzn: HatLine[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, d: hdennos }
    }));
    if (h.error || !h.data) {
      throw h.error ?? new Error('発注明細を読めませんでした');
    }
    return h.data.vhatzn.map(r => ({ ...r, hatzn: Number(r.hatzn) || 0, yday: r.yday ? String(r.yday).slice(0, 10) : null, ydaykbn: r.ydaykbn == null ? null : String(r.ydaykbn) }));
  }

  /** 発注入荷待ちの受注明細（未出荷・取消でない受注伝票。受注伝票番号＝登録順、行の順）と、伝票ごとの最後の行番号 */
  private async fetchCands(scode: string, gcodes: string[]): Promise<{ cands: Cand[]; maxLine: Map<number, number> }> {
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
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, mw: meiWhere }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('受注明細を読めませんでした');
    }
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
    return { cands, maxLine };
  }

  /**
   * 割り当てを受注明細に書く。全数を 1 回で割り当てた明細はその行を直し、それ以外は割り当てた分を新しい行にして
   * 元の行は残りの数量（残りが無いときは最初の割り当て分）にする
   */
  private async write(id: number, parts: Map<Cand, { q: number; set: Record<string, string>; hkey?: string; yday?: string | null }[]>,
    maxLine: Map<number, number>): Promise<NyuhikResult[]> {
    const updates: object[] = [];
    const inserts: object[] = [];
    const results: NyuhikResult[] = [];
    parts.forEach((ps, c) => {
      const m = c.m;
      const where = { id: { _eq: id }, denno: { _eq: c.denno }, line: { _eq: m.line } };
      const info = (p: { hkey?: string; yday?: string | null }) => (p.hkey ? { hkey: p.hkey, yday: p.yday ?? null } : {});
      // 元の行に残すもの: 残りがあれば残り（8 のまま）、無ければ最初の割り当て分
      const keep = c.left > 0 ? null : ps[0];
      const news = keep ? ps.slice(1) : ps;
      if (keep && news.length == 0) {
        updates.push({ where, _set: keep.set });
        results.push({ denno: c.denno, line: m.line, newLine: null, gcode: m.gcode, suu: keep.q, rest: 0, ...info(keep) });
        return;
      }
      const sub = { money: 0, tgenka: 0, taxmoney: 0, toutmoney: 0, tinmoney: 0 };
      for (const p of news) {
        const money = this.calcMoney(m, p.q);
        (Object.keys(sub) as (keyof typeof sub)[]).forEach(k => sub[k] += money[k]);
        const nl = (maxLine.get(c.denno) ?? 0) + 1;
        maxLine.set(c.denno, nl);
        inserts.push({
          id, denno: c.denno, line: nl, gcode: m.gcode, gtext: m.gtext, suu: p.q, tanka: m.tanka ?? 0, mmemo: m.mmemo,
          spec: m.spec, spdet: m.spdet, genka: m.genka, scode: m.scode, sday: m.sday, tanka1: m.tanka1, mtax: m.mtax, taxrate: m.taxrate,
          gskbn: m.gskbn, currency: m.currency, ...money, ...p.set
        });
        results.push({ denno: c.denno, line: m.line, newLine: nl, gcode: m.gcode, suu: p.q, rest: c.left, ...info(p) });
      }
      updates.push({
        where, _set: {
          suu: keep ? keep.q : c.left,
          money: this.num(m.money) - sub.money,
          tgenka: this.num(m.tgenka) - sub.tgenka,
          taxmoney: this.num(m.taxmoney) - sub.taxmoney,
          toutmoney: this.num(m.toutmoney) - sub.toutmoney,
          tinmoney: this.num(m.tinmoney) - sub.tinmoney,
          ...(keep ? keep.set : {})
        }
      });
      if (keep) {
        results.push({ denno: c.denno, line: m.line, newLine: null, gcode: m.gcode, suu: keep.q, rest: 0, ...info(keep) });
      }
    });
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

  /** 割り当てた結果を、画面に出す短い文にする（受注伝票番号-行 商品 数（分けたときは残り）） */
  describe(results: NyuhikResult[], what: string): string[] {
    return results.map(r => '受注' + r.denno + '-' + (r.newLine ?? r.line) + ' ' + r.gcode + ' ' + r.suu + ' ' + what
      + (r.hkey ? '（発注' + r.hkey.replace('_', '-') + ' 入荷日 ' + (r.yday ?? '') + '）' : '')
      + (r.newLine && r.rest > 0 ? '（' + r.line + '行目から分割。' + r.line + '行目の残り ' + r.rest + ' は入荷待ち）'
        : r.newLine ? '（' + r.line + '行目から分割）' : ''));
  }

  /**
   * 仕入伝票を保存したあとに引き当て、結果を画面に出す（失敗しても仕入伝票は保存済み）。
   * @returns 引き当てた件数
   */
  async allocateAndNotify(sdenno: number, scode: string | null, lines: NyukaLine[]): Promise<number> {
    try {
      const r = await this.allocate(sdenno, scode, lines);
      if (r.length) {
        this.usrsrv.toastNote('入荷を発注入荷待ちの受注明細に引き当てました（仕入' + sdenno + '）', this.describe(r, '引当'));
      }
      return r.length;
    } catch (e) {
      console.log('error nyuhik', e);
      this.usrsrv.toastErr('入荷引当', '仕入伝票' + sdenno + 'は保存しましたが、発注入荷待ちの受注明細への引き当てができませんでした');
      return 0;
    }
  }

  /**
   * 発注伝票を保存したあとに、入荷日を確定した発注明細へ受注明細を結び付け、結果を画面に出す（失敗しても発注伝票は保存済み）。
   * @returns 結び付けた件数
   */
  async linkAndNotify(hdenno: number, scode: string | null): Promise<number> {
    try {
      const r = await this.link(hdenno, scode);
      if (r.length) {
        this.usrsrv.toastNote('入荷日を確定した発注明細に、発注入荷待ちの受注明細を割り当てました（発注' + hdenno + '）', this.describe(r, '割当'));
      }
      return r.length;
    } catch (e) {
      console.log('error nyuhik link', e);
      this.usrsrv.toastErr('入荷引当', '発注伝票' + hdenno + 'は保存しましたが、発注入荷待ちの受注明細への割り当てができませんでした');
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
