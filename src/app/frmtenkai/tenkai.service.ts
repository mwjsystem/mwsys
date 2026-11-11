import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { ZAIKO_ZERO } from './../services/jyustock.service';

/** 区分: 1 = 出庫（展開元）、0 = 入庫（展開先） */
export type TenKubun = 0 | 1;
export const KUBUN_OUT: TenKubun = 1;
export const KUBUN_IN: TenKubun = 0;

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 展開伝票。DB のトリガー（db/20261114_tenkai.sql）と同じ値 */
export const EXTYPE_TENKAI = '7';

/** 展開指示書の QR コードの URL（倉庫のスマホで読むと、展開完了の画面が開く。テスト環境は ?db=test を付ける） */
export function tenCheckUrl(denno: number): string {
  return window.location.origin + '/frmtenkai/check/' + denno + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test');
}

/** 採番の種別（trnumber.type）: 展開伝票番号 */
export const TENKAI_NUMBER = 'tdenno';

/** 商品マスタの情報（品名・単位・数量区分・棚番・セット品の構成品） */
export interface TenGoods { gcode: string; gtext: string; unit: string; gskbn: string; tanano: string; zais: { zcode: string; irisu: number }[] }

/** 展開伝票の明細 1 行 */
export interface TenLine {
  line: number;
  kubun: TenKubun;
  gcode: string;
  suu: number;
  memo: string;
  /** 以下は商品マスタ・在庫から（保存しない） */
  gtext: string;
  unit: string;
  gskbn: string;
  tanano: string;
  zais: { zcode: string; irisu: number }[];
  /** 倉庫の在庫数（読めなければ null） */
  stock: number | null;
  /** 品番が商品マスタに無い */
  bad?: boolean;
}

/** 展開伝票（伝票番号・日付・倉庫・担当者と明細） */
export interface TenDen {
  denno: number;
  day: string;
  scode: string;
  tcode: string;
  /** 展開完了日（day は展開依頼日）。出庫は依頼日、入庫は完了日の在庫になる。未完了は null */
  cday: string | null;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  lines: TenLine[];
}

/** 在庫（trzaiko）の展開入（teni）・展開出（teno）の増減 1 件 */
export interface TenZaiko { scode: string; gcode: string; day: string; teni: number; teno: number }

/** 検索の 1 行（伝票ごと） */
export interface TenRow { denno: number; day: string; cday: string | null; scode: string; tcode: string; lines: number; outs: string; ins: string; updated_at: string | null }

interface TenRowDb {
  denno: number; line: number; day: string; scode: string; gcode: string; suu: number; kubun: number; memo: string | null;
  tcode: string | null; cday: string | null; created_at: string | null; created_by: string | null; updated_at: string | null; updated_by: string | null;
}

interface GoodsDb { gcode: string; gtext: string | null; unit: string | null; gskbn: string | null; tanano: string | null; msgzais: { zcode: string; irisu: number; msgoods: { gskbn: string } | null }[] }

/**
 * 展開伝票（在庫展開伝票）。trtenden は伝票と明細が 1 つのテーブルで、行ごとに日付・倉庫・担当者を持つ。
 * 保存は 明細の削除 → 登録 と、在庫（trzaiko）の展開出（teno）・展開入（teni）の増減を 1 トランザクションで書く
 * （変更のときは、読み込んだときの分を取り消してから今の分を足す）
 */
@Injectable({
  providedIn: 'root'
})
export class TenkaiService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);

  /** 商品マスタを読む（品名・単位・数量区分・棚番・構成品） */
  async goods(gcodes: string[]): Promise<Map<string, TenGoods>> {
    const list = [...new Set(gcodes.filter(g => g))];
    if (list.length == 0) {
      return new Map();
    }
    const Get = gql`
      query get_tengoods($id: smallint!, $gcodes: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
          gcode gtext unit gskbn tanano
          msgzais { zcode irisu msgoods { gskbn } }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ msgoods: GoodsDb[] }>({
      query: Get, variables: { id: this.usrsrv.compid, gcodes: list }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('商品マスタを読めませんでした');
    }
    return new Map(res.data.msgoods.map(g => [g.gcode, {
      gcode: g.gcode, gtext: g.gtext ?? '', unit: g.unit ?? '', gskbn: g.gskbn ?? '0', tanano: g.tanano ?? '',
      zais: g.msgzais.filter(z => z.msgoods?.gskbn == '0').map(z => ({ zcode: z.zcode, irisu: Number(z.irisu) }))
    }]));
  }

  /** 展開伝票を読む（無ければ null） */
  async load(denno: number): Promise<TenDen | null> {
    const Get = gql`
      query get_tenden($id: smallint!, $dno: Int!) {
        trtenden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, order_by: {line: asc}) {
          denno line day scode gcode suu kubun memo tcode cday created_at created_by updated_at updated_by
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trtenden: TenRowDb[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('展開伝票を読めませんでした');
    }
    const rows = res.data.trtenden;
    if (rows.length == 0) {
      return null;
    }
    const g = await this.goods(rows.map(r => r.gcode));
    const h = rows[0];
    return {
      denno, day: (h.day ?? '').slice(0, 10), scode: h.scode ?? '', tcode: h.tcode ?? '', cday: h.cday ? h.cday.slice(0, 10) : null,
      created_at: h.created_at, created_by: h.created_by, updated_at: h.updated_at, updated_by: h.updated_by,
      lines: rows.map(r => {
        const m = g.get(r.gcode);
        return {
          line: r.line, kubun: (Number(r.kubun) == 1 ? 1 : 0) as TenKubun, gcode: r.gcode, suu: Number(r.suu ?? 0), memo: r.memo ?? '',
          gtext: m?.gtext ?? '', unit: m?.unit ?? '', gskbn: m?.gskbn ?? '0', tanano: m?.tanano ?? '', zais: m?.zais ?? [], stock: null, bad: !m
        };
      })
    };
  }

  /**
   * 明細から在庫の増減を作る。出庫（展開元）は依頼日 day に展開出 teno、入庫（展開先）は完了日 cday に展開入 teni
   * （完了日が無ければ入庫はまだ足さない）。セット品は構成品ごと。sign = -1 は読み込んだときの分の取り消し
   */
  zaikoOf(scode: string, day: string, cday: string | null, lines: TenLine[], sign = 1): TenZaiko[] {
    if (!scode) {
      return [];
    }
    const ret: TenZaiko[] = [];
    for (const l of lines) {
      const at = l.kubun == KUBUN_OUT ? day : cday;
      if (!l.gcode || !Number(l.suu) || !at) {
        continue;
      }
      const parts = l.gskbn == '1' ? l.zais.map(z => ({ gcode: z.zcode, n: Number(l.suu) * z.irisu }))
        : l.gskbn == '0' ? [{ gcode: l.gcode, n: Number(l.suu) }] : [];
      for (const p of parts) {
        const n = sign * p.n;
        ret.push({ scode, gcode: p.gcode, day: at.slice(0, 10), teni: l.kubun == KUBUN_IN ? n : 0, teno: l.kubun == KUBUN_OUT ? n : 0 });
      }
    }
    return ret;
  }

  /** 在庫の増減を 倉庫・商品・日付 ごとにまとめ、伝票と同じミューテーションで書く行にする */
  private zaikoRows(list: TenZaiko[]): { zinit: object[]; zinc: object[] } {
    const id = this.usrsrv.compid;
    const sum = new Map<string, TenZaiko>();
    for (const z of list) {
      const k = z.scode + '\t' + z.gcode + '\t' + z.day;
      const s = sum.get(k) ?? { ...z, teni: 0, teno: 0 };
      s.teni += z.teni;
      s.teno += z.teno;
      sum.set(k, s);
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    sum.forEach(z => {
      if (z.teni == 0 && z.teno == 0) {
        return;
      }
      zinit.push({ id, scode: z.scode, gcode: z.gcode, day: z.day, ...ZAIKO_ZERO });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: z.scode }, gcode: { _eq: z.gcode }, day: { _eq: z.day } },
        _inc: { teni: z.teni, teno: z.teno }
      });
    });
    return { zinit, zinc };
  }

  /**
   * 保存（新規も変更も）。明細を消して登録し直し、在庫の増減（zaiko: 読込時の分の取り消し＋今の分）を書く。1 トランザクション。
   * 登録日時・登録者は最初の登録のものを残す
   */
  async save(d: TenDen, zaiko: TenZaiko[]): Promise<void> {
    const id = this.usrsrv.compid;
    const now = new Date();
    const by = this.usrsrv.staff?.code ?? null;
    const objs = d.lines.map((l, i) => ({
      id, denno: d.denno, line: i + 1, day: d.day, scode: d.scode, gcode: l.gcode, suu: Number(l.suu), kubun: l.kubun, memo: l.memo || null,
      tcode: d.tcode || null, cday: d.cday || null, created_at: d.created_at ?? now, created_by: d.created_by ?? by, updated_at: now, updated_by: by
    }));
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const Save = gql`
      mutation save_tenden($id: smallint!, $dno: Int!, $objs: [trtenden_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        delete_trtenden(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { affected_rows }
        insert_trtenden(objects: $objs) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Save, variables: { id, dno: d.denno, objs, zinit, zinc } }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('保存の結果がありません');
    }
  }

  /**
   * 展開完了（スマホの展開完了の画面から）。読み込んだ伝票の完了日を cday にして保存し、入庫（展開先）の在庫を完了日に足す
   * （前に完了日があれば、その日の分は取り消す）
   */
  async complete(d: TenDen, cday: string): Promise<TenDen> {
    const done: TenDen = { ...d, cday };
    await this.save(done, [...this.zaikoOf(d.scode, d.day, d.cday, d.lines, -1), ...this.zaikoOf(d.scode, d.day, cday, d.lines)]);
    return done;
  }

  /** 伝票を探す（依頼日の範囲・倉庫・商品コード・未完了だけ）。伝票ごとにまとめ、新しい順 */
  async search(from: string, to: string, scode: string, gcode: string, open = false): Promise<TenRow[]> {
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }];
    if (open) {
      and.push({ cday: { _is_null: true } });
    }
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
    if (gcode.trim()) {
      const Find = gql`
        query find_tenden($where: trtenden_bool_exp!) { trtenden(where: $where, limit: 500) { denno } }`;
      const f = await firstValueFrom(this.apollo.query<{ trtenden: { denno: number }[] }>({
        query: Find, fetchPolicy: 'network-only', variables: { where: { _and: [...and, { gcode: { _ilike: '%' + gcode.trim() + '%' } }] } }
      }));
      if (f.error || !f.data) {
        throw f.error ?? new Error('展開伝票を探せませんでした');
      }
      dennos = [...new Set(f.data.trtenden.map(e => e.denno))];
      if (dennos.length == 0) {
        return [];
      }
    }
    const Get = gql`
      query get_tenlist($where: trtenden_bool_exp!) {
        trtenden(where: $where, order_by: [{denno: desc}, {line: asc}], limit: 3000) { denno line day cday scode gcode suu kubun tcode updated_at }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trtenden: TenRowDb[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: dennos ? [...and, { denno: { _in: dennos } }] : and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('展開伝票を探せませんでした');
    }
    const map = new Map<number, TenRow>();
    for (const r of res.data.trtenden) {
      const t = map.get(r.denno) ?? { denno: r.denno, day: (r.day ?? '').slice(0, 10), cday: r.cday ? r.cday.slice(0, 10) : null, scode: r.scode, tcode: r.tcode ?? '', lines: 0, outs: '', ins: '', updated_at: r.updated_at };
      t.lines++;
      const s = r.gcode + '×' + r.suu;
      if (Number(r.kubun) == 1) {
        t.outs += (t.outs ? ' ' : '') + s;
      } else {
        t.ins += (t.ins ? ' ' : '') + s;
      }
      map.set(r.denno, t);
    }
    return [...map.values()];
  }
}
