import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { ZAIKO_ZERO } from './../services/jyustock.service';
import { TenkaiService } from './../frmtenkai/tenkai.service';

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 入荷伝票（発注外入荷）。DB のトリガー（db/20261120_hgnden.sql）と同じ値 */
export const EXTYPE_HGN = '10';

/** 採番の種別（trnumber.type）: 発注外入荷伝票番号 */
export const HGN_NUMBER = 'gdenno';

/** 発注外入荷伝票の明細 1 行 */
export interface HgnLine {
  line: number;
  gcode: string;
  suu: number;
  memo: string;
  /** 以下は商品マスタ・在庫から（保存しない） */
  gtext: string;
  unit: string;
  gskbn: string;
  zais: { zcode: string; irisu: number }[];
  stock: number | null;
  bad?: boolean;
}

export interface HgnDen {
  denno: number;
  day: string;
  scode: string;
  tcode: string;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  lines: HgnLine[];
}

/** 在庫（trzaiko）の入庫（nyuk）の増減 1 件 */
export interface HgnZaiko { scode: string; gcode: string; day: string; nyuk: number }

/** 検索の 1 行（伝票ごと） */
export interface HgnRow { denno: number; day: string; scode: string; tcode: string; lines: number; suu: number; text: string }

interface HgnRowDb {
  denno: number; line: number; day: string; scode: string; gcode: string; suu: number; memo: string | null;
  tcode: string | null; created_at: string | null; created_by: string | null; updated_at: string | null; updated_by: string | null;
}

/**
 * 発注外入荷伝票（trhgnden）。発注伝票の無い入荷（サンプル・無償提供・返却品など）で在庫を増やす。
 * trhgnden は伝票と明細が 1 つのテーブル（行ごとに 日付・倉庫・担当者 を持つ）。
 * 保存は 明細の削除 → 登録 と、在庫（trzaiko）の入庫（nyuk）の増減を 1 トランザクションで書く
 * （変更・削除のときは、読み込んだときの分を取り消す）
 */
@Injectable({
  providedIn: 'root'
})
export class HgndenService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);
  private tensrv = inject(TenkaiService);

  /** 商品マスタを読む（展開伝票と同じ） */
  goods(gcodes: string[]) {
    return this.tensrv.goods(gcodes);
  }

  async load(denno: number): Promise<HgnDen | null> {
    const Get = gql`
      query get_hgnden($id: smallint!, $dno: Int!) {
        trhgnden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, order_by: {line: asc}) {
          denno line day scode gcode suu memo tcode created_at created_by updated_at updated_by
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trhgnden: HgnRowDb[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('発注外入荷伝票を読めませんでした');
    }
    const rows = res.data.trhgnden;
    if (rows.length == 0) {
      return null;
    }
    const g = await this.goods(rows.map(r => r.gcode));
    const h = rows[0];
    return {
      denno, day: (h.day ?? '').slice(0, 10), scode: h.scode ?? '', tcode: h.tcode ?? '',
      created_at: h.created_at, created_by: h.created_by, updated_at: h.updated_at, updated_by: h.updated_by,
      lines: rows.map(r => {
        const m = g.get(r.gcode);
        return {
          line: r.line, gcode: r.gcode, suu: Number(r.suu ?? 0), memo: r.memo ?? '',
          gtext: m?.gtext ?? '', unit: m?.unit ?? '', gskbn: m?.gskbn ?? '0', zais: m?.zais ?? [], stock: null, bad: !m
        };
      })
    };
  }

  /** 明細から在庫の入庫（nyuk）の増減を作る。セット品は構成品ごと。sign = -1 は読み込んだときの分の取り消し */
  zaikoOf(scode: string, day: string, lines: HgnLine[], sign = 1): HgnZaiko[] {
    if (!scode || !day) {
      return [];
    }
    const ret: HgnZaiko[] = [];
    for (const l of lines) {
      const q = Number(l.suu);
      if (!l.gcode || !q) {
        continue;
      }
      const parts = l.gskbn == '1' ? l.zais.map(z => ({ gcode: z.zcode, n: q * z.irisu }))
        : l.gskbn == '0' ? [{ gcode: l.gcode, n: q }] : [];
      for (const p of parts) {
        ret.push({ scode, gcode: p.gcode, day: day.slice(0, 10), nyuk: sign * p.n });
      }
    }
    return ret;
  }

  private zaikoRows(list: HgnZaiko[]): { zinit: object[]; zinc: object[] } {
    const id = this.usrsrv.compid;
    const sum = new Map<string, HgnZaiko>();
    for (const z of list) {
      const k = z.scode + '\t' + z.gcode + '\t' + z.day;
      const s = sum.get(k) ?? { ...z, nyuk: 0 };
      s.nyuk += z.nyuk;
      sum.set(k, s);
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    sum.forEach(z => {
      if (z.nyuk == 0) {
        return;
      }
      zinit.push({ id, scode: z.scode, gcode: z.gcode, day: z.day, ...ZAIKO_ZERO });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: z.scode }, gcode: { _eq: z.gcode }, day: { _eq: z.day } },
        _inc: { nyuk: z.nyuk }
      });
    });
    return { zinit, zinc };
  }

  /** 保存（新規も変更も）。明細を消して登録し直し、在庫の増減を書く。1 トランザクション */
  async save(d: HgnDen, zaiko: HgnZaiko[]): Promise<void> {
    const id = this.usrsrv.compid;
    const now = new Date();
    const by = this.usrsrv.staff?.code ?? null;
    const objs = d.lines.map((l, i) => ({
      id, denno: d.denno, line: i + 1, day: d.day, scode: d.scode, gcode: l.gcode, suu: Number(l.suu),
      memo: l.memo || null, tcode: d.tcode,
      created_at: d.created_at ?? now, created_by: d.created_by ?? by, updated_at: now, updated_by: by
    }));
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const Save = gql`
      mutation save_hgnden($id: smallint!, $dno: Int!, $objs: [trhgnden_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        delete_trhgnden(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { affected_rows }
        insert_trhgnden(objects: $objs) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Save, variables: { id, dno: d.denno, objs, zinit, zinc } }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('保存の結果がありません');
    }
  }

  /** 伝票を探す（日付の範囲・倉庫・商品コード・備考）。伝票ごとにまとめ、新しい順 */
  async search(from: string, to: string, scode: string, gcode: string, memo: string): Promise<HgnRow[]> {
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }];
    if (from) {
      and.push({ day: { _gte: from } });
    }
    if (to) {
      and.push({ day: { _lte: to } });
    }
    if (scode) {
      and.push({ scode: { _eq: scode } });
    }
    let dennos: number[] | null = null;
    if (gcode.trim() || memo.trim()) {
      const cond = [...and];
      if (gcode.trim()) {
        cond.push({ gcode: { _ilike: '%' + gcode.trim() + '%' } });
      }
      if (memo.trim()) {
        cond.push({ memo: { _ilike: '%' + memo.trim() + '%' } });
      }
      const Find = gql`query find_hgnden($where: trhgnden_bool_exp!) { trhgnden(where: $where, limit: 500) { denno } }`;
      const f = await firstValueFrom(this.apollo.query<{ trhgnden: { denno: number }[] }>({
        query: Find, fetchPolicy: 'network-only', variables: { where: { _and: cond } }
      }));
      if (f.error || !f.data) {
        throw f.error ?? new Error('発注外入荷伝票を探せませんでした');
      }
      dennos = [...new Set(f.data.trhgnden.map(e => e.denno))];
      if (dennos.length == 0) {
        return [];
      }
    }
    const Get = gql`
      query get_hgnlist($where: trhgnden_bool_exp!) {
        trhgnden(where: $where, order_by: [{denno: desc}, {line: asc}], limit: 3000) { denno line day scode gcode suu tcode }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trhgnden: HgnRowDb[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: dennos ? [...and, { denno: { _in: dennos } }] : and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('発注外入荷伝票を探せませんでした');
    }
    const map = new Map<number, HgnRow>();
    for (const r of res.data.trhgnden) {
      const t = map.get(r.denno) ?? { denno: r.denno, day: (r.day ?? '').slice(0, 10), scode: r.scode, tcode: r.tcode ?? '', lines: 0, suu: 0, text: '' };
      t.lines++;
      t.suu += Number(r.suu ?? 0);
      t.text += (t.text ? ' ' : '') + r.gcode + ' ' + r.suu;
      map.set(r.denno, t);
    }
    return [...map.values()];
  }
}
