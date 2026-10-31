import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';

/** furiage の 1 行（月・担当・大分類・部門ごと） */
export interface UriRow { ym: string; tanto: string; tname: string; daibunrui: string; bumon: string; uriage: number; arari: number }
/** furiage_pers の 1 行 */
export interface PersRow { seq: number; ym: string; kingaku: number }
/** 個人集計の項目 */
export interface PersItem { seq: number; tanto: string; item: string; kind: string; val: string | null }

/** 個人集計の行（実績・昨年・上昇額・上昇率） */
export interface PersLine { label: string; cells: (number | null)[]; total: number | null; pct?: boolean }
export interface PersBlock { item: PersItem; lines: PersLine[] }

/** 売上報告の列（当月日割・各月・前年 12 月） */
export const COL_NICHI = 'nichi';
export const COL_PREV = 'prev12';
export const monthCol = (m: number): string => 'm' + ('0' + m).slice(-2);

/** 金額（実績・昨年・粗利） */
export interface Val { jis: number; sak: number; ara: number }
/** 集計の木の 1 行 */
export interface Node {
  key: string;
  label: string;
  level: number;
  /** 担当者の行のコード（目標との突き合わせ用。'' は「他」） */
  tanto?: string;
  vals: Record<string, Val>;
  children: Node[];
}
/** 集計の切り口: 担当→大分類→部門 / 大分類→部門 / 部門 */
export type Mode = 'tanto' | 'dai' | 'bu';

/** 画面に渡すデータ一式 */
export interface UriReport {
  /** 対象年 */
  year: number;
  /** 対象月 */
  month: number;
  jisseki: UriRow[];
  sakunen: UriRow[];
  /** 年別の実績（'YYYY-MM' → 金額） */
  yearly: Record<string, number>;
  persItems: PersItem[];
  persJ: PersRow[];
  persL: PersRow[];
  /** 担当者 → 年間目標（'' は「他」） */
  targets: Record<string, number>;
  /** 当月の営業日数 */
  monthBiz: number;
  /** 当月の、対象日までの営業日数 */
  monthDone: number;
  /** 年度（前年 12 月〜 11 月）の稼働日数 */
  yearBiz: number;
  /** 年度の、対象日までの累積稼働日 */
  yearDone: number;
  /** 昨年の当月に掛ける経過割合 */
  rate: number;
}

const iso = (d: Date): string => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

/**
 * 売上報告（現行の「2026年売上報告.xlsm」の置き換え）。集計は DB の関数（furiage など）が行い、ここでは表の形に組み立てる。
 * 年度は前年 12 月〜 11 月。列は当月日割・1〜12 月・前年 12 月で、昨年は前年同月（当月日割は前年同月 × 経過割合）。
 */
@Injectable({
  providedIn: 'root'
})
export class RepuriageService {
  private usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private apollo = inject(Apollo);

  /** 営業日か（土日と休日マスタ以外） */
  private isBiz(d: Date): boolean {
    const w = d.getDay();
    return w != 0 && w != 6 && !this.usrsrv.holidays.includes(this.usrsrv.formatDate(d));
  }

  /** from 〜 to の営業日数 */
  private bizDays(from: Date, to: Date): number {
    let n = 0;
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (this.isBiz(d)) {
        n++;
      }
    }
    return n;
  }

  async load(target: Date): Promise<UriReport> {
    const id = this.usrsrv.compid;
    const y = target.getFullYear();
    const m = target.getMonth() + 1;
    const Get = gql`
      query get_uriage($id: smallint!, $jfr: date!, $jto: date!, $lfr: date!, $lto: date!, $yfr: date!, $nendo: smallint!) {
        jisseki: furiage(args: {p_id: $id, p_from: $jfr, p_to: $jto, p_master: false}) { ym tanto tname daibunrui bumon uriage arari }
        sakunen: furiage(args: {p_id: $id, p_from: $lfr, p_to: $lto, p_master: true}) { ym tanto tname daibunrui bumon uriage arari }
        yearly: furiage_ym(args: {p_id: $id, p_from: $yfr, p_to: $jto}) { ym uriage }
        persJ: furiage_pers(args: {p_id: $id, p_from: $jfr, p_to: $jto}) { seq ym kingaku }
        persL: furiage_pers(args: {p_id: $id, p_from: $lfr, p_to: $lto}) { seq ym kingaku }
        msuripers(where: {id: {_eq: $id}}, order_by: {seq: asc}) { seq tanto item kind val }
        msurimoku(where: {id: {_eq: $id}, nendo: {_eq: $nendo}}) { tcode target }
      }`;
    const [res] = await Promise.all([
      firstValueFrom(this.apollo.query<{
        jisseki: UriRow[]; sakunen: UriRow[]; yearly: { ym: string; uriage: number }[]; persJ: PersRow[]; persL: PersRow[];
        msuripers: PersItem[]; msurimoku: { tcode: string; target: number }[];
      }>({
        query: Get, fetchPolicy: 'network-only',
        variables: {
          id: id, nendo: y,
          jfr: (y - 1) + '-12-01', jto: iso(target),
          lfr: (y - 2) + '-12-01', lto: (y - 1) + '-12-31',
          yfr: (y - 16) + '-01-01'
        }
      })),
      this.bunsrv.qryBunrui()
    ]);
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    const q = res.data;
    const yearly: Record<string, number> = {};
    q.yearly.forEach(e => yearly[e.ym] = Number(e.uriage));
    const targets: Record<string, number> = {};
    q.msurimoku.forEach(e => targets[e.tcode] = Number(e.target));
    const monthBiz = this.bizDays(new Date(y, m - 1, 1), new Date(y, m, 0));
    const monthDone = this.bizDays(new Date(y, m - 1, 1), target);
    return {
      year: y, month: m,
      jisseki: q.jisseki as UriRow[], sakunen: q.sakunen as UriRow[], yearly,
      persItems: q.msuripers as PersItem[], persJ: q.persJ as PersRow[], persL: q.persL as PersRow[], targets,
      monthBiz, monthDone,
      yearBiz: this.bizDays(new Date(y - 1, 11, 1), new Date(y, 10, 30)),
      yearDone: this.bizDays(new Date(y - 1, 11, 1), target),
      rate: monthBiz > 0 ? monthDone / monthBiz : 0
    };
  }

  private bunName(kubun: string, code: string): string {
    if (!code || code == '施工') {
      return code || '（未設定）';
    }
    return code + (this.bunsrv.kbn[kubun]?.find(e => (e.value ?? '').trim() == code)?.viewval ?? '');
  }

  /** 実績・昨年の行を、切り口 mode の木にする（金額の多い順） */
  tree(r: UriReport, mode: Mode): Node {
    const root: Node = { key: '', label: '総計', level: -1, vals: {}, children: [] };
    const add = (vals: Record<string, Val>, col: string, kind: 'jis' | 'sak', uri: number, ara: number) => {
      const v = vals[col] ?? (vals[col] = { jis: 0, sak: 0, ara: 0 });
      v[kind] += uri;
      v.ara += ara;
    };
    const path = (e: UriRow): { key: string; label: string; tanto?: string }[] => {
      const dai = { key: e.daibunrui, label: this.bunName('daibunrui', e.daibunrui) };
      const bu = { key: e.bumon, label: this.bunName('chubunrui', e.bumon) };
      return mode == 'tanto' ? [{ key: e.tname, label: e.tname, tanto: e.tanto }, dai, bu] : mode == 'dai' ? [dai, bu] : [bu];
    };
    const put = (e: UriRow, col: string, kind: 'jis' | 'sak', uri: number, ara: number) => {
      add(root.vals, col, kind, uri, ara);
      let node = root;
      path(e).forEach((p, i) => {
        let c = node.children.find(n => n.key == node.key + '/' + p.key);
        if (!c) {
          c = { key: node.key + '/' + p.key, label: p.label, level: i, tanto: p.tanto, vals: {}, children: [] };
          node.children.push(c);
        }
        add(c.vals, col, kind, uri, ara);
        node = c;
      });
    };
    for (const e of r.jisseki) {
      const uri = Number(e.uriage);
      const ara = Number(e.arari);
      const [yy, mm] = e.ym.split('-').map(Number);
      if (yy < r.year) {
        put(e, COL_PREV, 'jis', uri, ara);
      } else {
        put(e, monthCol(mm), 'jis', uri, ara);
        if (mm == r.month) {
          put(e, COL_NICHI, 'jis', uri, ara);
        }
      }
    }
    for (const e of r.sakunen) {
      const uri = Number(e.uriage);
      const [yy, mm] = e.ym.split('-').map(Number);
      if (yy < r.year - 1) {
        put(e, COL_PREV, 'sak', uri, 0);
      } else {
        put(e, monthCol(mm), 'sak', uri, 0);
        if (mm == r.month) {
          put(e, COL_NICHI, 'sak', Math.round(uri * r.rate), 0);
        }
      }
    }
    const sort = (n: Node) => {
      n.children.sort((a, b) => a.level == 0 && mode == 'tanto' ? a.label.localeCompare(b.label) : this.cum(r, b).jis - this.cum(r, a).jis);
      n.children.forEach(sort);
    };
    sort(root);
    return root;
  }

  /** 累計（前年 12 月 + 1 月〜前月 + 当月日割） */
  cum(r: UriReport, n: Node): Val {
    const ret: Val = { jis: 0, sak: 0, ara: 0 };
    const cols = [COL_PREV, COL_NICHI];
    for (let i = 1; i < r.month; i++) {
      cols.push(monthCol(i));
    }
    cols.forEach(c => {
      ret.jis += n.vals[c]?.jis ?? 0;
      ret.sak += n.vals[c]?.sak ?? 0;
      ret.ara += n.vals[c]?.ara ?? 0;
    });
    return ret;
  }
}
