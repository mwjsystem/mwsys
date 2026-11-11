import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { ZAIKO_ZERO } from './../services/jyustock.service';
import { TenkaiService } from './../frmtenkai/tenkai.service';

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 破棄伝票。DB のトリガー（db/20261115_chosei.sql）と同じ値 */
export const EXTYPE_CHOSEI = '11';

/** 採番の種別（trnumber.type）: 在庫調整伝票番号 */
export const CHOSEI_NUMBER = 'cdenno';

/** 在庫調整伝票の明細 1 行。suu は画面では正の数で、zo（増）のとき DB には負の数で入れる */
export interface ChoLine {
  line: number;
  /** true = 在庫を増やす（原因不明で多かった など）、false = 減らす（破棄・紛失など） */
  zo: boolean;
  gcode: string;
  suu: number;
  /** 理由（分類マスタ hakikbn） */
  chokbn: string;
  memo: string;
  /** 以下は商品マスタ・在庫から（保存しない） */
  gtext: string;
  unit: string;
  gskbn: string;
  zais: { zcode: string; irisu: number }[];
  stock: number | null;
  bad?: boolean;
}

export interface ChoDen {
  denno: number;
  day: string;
  scode: string;
  tcode: string;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  lines: ChoLine[];
}

/** 在庫（trzaiko）の破棄（haki）の増減 1 件（減らすときは正、増やすときは負） */
export interface ChoZaiko { scode: string; gcode: string; day: string; haki: number }

/** 検索の 1 行（伝票ごと） */
export interface ChoRow { denno: number; day: string; scode: string; tcode: string; lines: number; text: string }

interface ChoRowDb {
  denno: number; line: number; day: string; scode: string; gcode: string; suu: number; memo: string | null; chokbn: string | null;
  tcode: string | null; created_at: string | null; created_by: string | null; updated_at: string | null; updated_by: string | null;
}

/**
 * 在庫調整伝票（現行の破棄伝票。trchoden）。破棄・紛失などで在庫を減らすほか、原因不明で在庫が多かったときに増やす。
 * 保存は 明細の削除 → 登録 と、在庫（trzaiko）の破棄（haki）の増減を 1 トランザクションで書く
 * （変更のときは、読み込んだときの分を取り消してから今の分を足す）
 */
@Injectable({
  providedIn: 'root'
})
export class ChoseiService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);
  private tensrv = inject(TenkaiService);

  /** 商品マスタを読む（展開伝票と同じ） */
  goods(gcodes: string[]) {
    return this.tensrv.goods(gcodes);
  }

  async load(denno: number): Promise<ChoDen | null> {
    const Get = gql`
      query get_choden($id: smallint!, $dno: Int!) {
        trchoden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, order_by: {line: asc}) {
          denno line day scode gcode suu memo chokbn tcode created_at created_by updated_at updated_by
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trchoden: ChoRowDb[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('在庫調整伝票を読めませんでした');
    }
    const rows = res.data.trchoden;
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
        const n = Number(r.suu ?? 0);
        return {
          line: r.line, zo: n < 0, gcode: r.gcode, suu: Math.abs(n), chokbn: r.chokbn ?? '', memo: r.memo ?? '',
          gtext: m?.gtext ?? '', unit: m?.unit ?? '', gskbn: m?.gskbn ?? '0', zais: m?.zais ?? [], stock: null, bad: !m
        };
      })
    };
  }

  /** 明細から在庫の破棄（haki）の増減を作る。セット品は構成品ごと。sign = -1 は読み込んだときの分の取り消し */
  zaikoOf(scode: string, day: string, lines: ChoLine[], sign = 1): ChoZaiko[] {
    if (!scode || !day) {
      return [];
    }
    const ret: ChoZaiko[] = [];
    for (const l of lines) {
      if (!l.gcode || !Number(l.suu)) {
        continue;
      }
      const q = (l.zo ? -1 : 1) * Number(l.suu);
      const parts = l.gskbn == '1' ? l.zais.map(z => ({ gcode: z.zcode, n: q * z.irisu }))
        : l.gskbn == '0' ? [{ gcode: l.gcode, n: q }] : [];
      for (const p of parts) {
        ret.push({ scode, gcode: p.gcode, day: day.slice(0, 10), haki: sign * p.n });
      }
    }
    return ret;
  }

  private zaikoRows(list: ChoZaiko[]): { zinit: object[]; zinc: object[] } {
    const id = this.usrsrv.compid;
    const sum = new Map<string, ChoZaiko>();
    for (const z of list) {
      const k = z.scode + '\t' + z.gcode + '\t' + z.day;
      const s = sum.get(k) ?? { ...z, haki: 0 };
      s.haki += z.haki;
      sum.set(k, s);
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    sum.forEach(z => {
      if (z.haki == 0) {
        return;
      }
      zinit.push({ id, scode: z.scode, gcode: z.gcode, day: z.day, ...ZAIKO_ZERO });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: z.scode }, gcode: { _eq: z.gcode }, day: { _eq: z.day } },
        _inc: { haki: z.haki }
      });
    });
    return { zinit, zinc };
  }

  /** 保存（新規も変更も）。明細を消して登録し直し、在庫の増減を書く。1 トランザクション */
  async save(d: ChoDen, zaiko: ChoZaiko[]): Promise<void> {
    const id = this.usrsrv.compid;
    const now = new Date();
    const by = this.usrsrv.staff?.code ?? null;
    const objs = d.lines.map((l, i) => ({
      id, denno: d.denno, line: i + 1, day: d.day, scode: d.scode, gcode: l.gcode, suu: (l.zo ? -1 : 1) * Number(l.suu),
      memo: l.memo || null, chokbn: l.chokbn || null, tcode: d.tcode,
      created_at: d.created_at ?? now, created_by: d.created_by ?? by, updated_at: now, updated_by: by
    }));
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const Save = gql`
      mutation save_choden($id: smallint!, $dno: Int!, $objs: [trchoden_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        delete_trchoden(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { affected_rows }
        insert_trchoden(objects: $objs) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Save, variables: { id, dno: d.denno, objs, zinit, zinc } }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('保存の結果がありません');
    }
  }

  /** 伝票を探す（日付の範囲・倉庫・商品コード・理由）。伝票ごとにまとめ、新しい順 */
  async search(from: string, to: string, scode: string, gcode: string, chokbn: string): Promise<ChoRow[]> {
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
    if (gcode.trim() || chokbn) {
      const cond = [...and];
      if (gcode.trim()) {
        cond.push({ gcode: { _ilike: '%' + gcode.trim() + '%' } });
      }
      if (chokbn) {
        cond.push({ chokbn: { _eq: chokbn } });
      }
      const Find = gql`query find_choden($where: trchoden_bool_exp!) { trchoden(where: $where, limit: 500) { denno } }`;
      const f = await firstValueFrom(this.apollo.query<{ trchoden: { denno: number }[] }>({
        query: Find, fetchPolicy: 'network-only', variables: { where: { _and: cond } }
      }));
      if (f.error || !f.data) {
        throw f.error ?? new Error('在庫調整伝票を探せませんでした');
      }
      dennos = [...new Set(f.data.trchoden.map(e => e.denno))];
      if (dennos.length == 0) {
        return [];
      }
    }
    const Get = gql`
      query get_cholist($where: trchoden_bool_exp!) {
        trchoden(where: $where, order_by: [{denno: desc}, {line: asc}], limit: 3000) { denno line day scode gcode suu chokbn tcode }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trchoden: ChoRowDb[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: dennos ? [...and, { denno: { _in: dennos } }] : and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('在庫調整伝票を探せませんでした');
    }
    const map = new Map<number, ChoRow>();
    for (const r of res.data.trchoden) {
      const t = map.get(r.denno) ?? { denno: r.denno, day: (r.day ?? '').slice(0, 10), scode: r.scode, tcode: r.tcode ?? '', lines: 0, text: '' };
      t.lines++;
      const n = Number(r.suu);
      t.text += (t.text ? ' ' : '') + r.gcode + (n < 0 ? ' +' + (-n) : ' -' + n);
      map.set(r.denno, t);
    }
    return [...map.values()];
  }
}
