import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { JDST } from './../frmship/ship-forms';

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 加工依頼。DB のトリガー（db/20261123_kako.sql）と同じ値 */
export const EXTYPE_KAKO = '9';

/** 採番の種別（trnumber.type）: 加工指示番号 */
export const KAKO_NUMBER = 'kakono';

/** 予定納期（依頼日から何営業日後。今の養父刺繍依頼一覧の WORKDAY(依頼日, 4 + 1) と同じ） */
export const KAKO_DAYS = 5;

/** 種類（受注明細区分 jmeikbn と同じ値） */
export const KAKO_KINDS = [{ value: '6', name: '刺繍' }, { value: '7', name: 'プリント' }];

/** 状態（1〜6）。名前は配列の 0 番目が 1 */
export const KAKO_STEPS = ['依頼', '倉庫から発送', '加工先で受取', '加工済・発送', '倉庫で受取', '出荷済'];
export const stepName = (s: number) => KAKO_STEPS[s - 1] ?? String(s);

/** 加工内容の決まり文句（押すと加工内容に足す） */
export const NAIYO_WORDS = ['胸刺繍', '袖刺繍', '背中', '左袖', '右袖', '右足', '左足', 'ネーム', 'オリ付', 'ワッペン', 'モール', '帯表', '帯裏'];

/** 位置の候補（指示書の図に印を付けられる位置。kakofig.ts の POSI_SPOTS と同じ名前。ほかの名前も入れられるが、図には出ない） */
export const POSI_WORDS = ['胸', '右胸', '右袖', '左袖', '背中', '襟', 'オリマーク', '右足', '左足', 'A表', 'A裏', 'B表', 'B裏', 'ネーム'];

/** 加工指示の QR コードの URL（加工先・倉庫のスマホで読むと、状態を進める画面が開く。テスト環境は ?db=test を付ける） */
export function kakoCheckUrl(kno: number): string {
  return window.location.origin + '/frmkako/check/' + kno + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test');
}

export interface KakoLine { line: number; jline: number | null; gcode: string; gtext: string; suu: number; memo: string }
/** img: 刺繍の図（画像の data URL。なければ ''） */
export interface KakoPosi { line: number; posi: string; naiyo: string; shotai: string; color: string; size: string; memo: string; img: string }
/** 段階ごとの日時・担当（2〜6） */
export interface KakoStep { at: string | null; by: string | null }

export interface KakoDen {
  kno: number;
  jdenno: number | null;
  mcode: string;
  mname: string;
  kind: string;
  dtype: 'S' | 'V';
  dcode: string;
  rscode: string;
  renban: string;
  tcode: string;
  reqday: string;
  wishday: string;
  planday: string;
  doukon: boolean;
  naiyo: string;
  memo: string;
  status: number;
  /** steps[2]〜steps[6] */
  steps: Record<number, KakoStep>;
  del: boolean;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  lines: KakoLine[];
  posis: KakoPosi[];
}

/** 受注伝票から引き継ぐもの */
export interface KakoOrder {
  denno: number; mcode: string; mname: string; tcode: string; scode: string; jdstatus: string | null;
  lines: { line: number; gcode: string; gtext: string; suu: number; spec: string | null; mmemo: string }[];
}

/** 一覧の 1 行 */
export interface KakoRow {
  kno: number; renban: string; jdenno: number | null; mcode: string; mname: string; kind: string; dtype: string; dcode: string;
  tcode: string; reqday: string; wishday: string; planday: string; doukon: boolean; naiyo: string; memo: string; status: number;
  steps: Record<number, KakoStep>; del: boolean; gcodes: string; suu: number;
}

export interface KakoFilter {
  from: string; to: string; dest: string; tcode: string; open: boolean; status: number | null; text: string;
}

const HEAD = `kno jdenno mcode mname kind dtype dcode rscode renban tcode reqday wishday planday doukon naiyo memo status
  s2_at s2_by s3_at s3_by s4_at s4_by s5_at s5_by s6_at s6_by del created_at created_by updated_at updated_by`;

type HeadDb = Record<string, unknown>;
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : '');
const stepsOf = (h: HeadDb): Record<number, KakoStep> => {
  const s: Record<number, KakoStep> = {};
  for (let i = 2; i <= 6; i++) {
    s[i] = { at: (h['s' + i + '_at'] as string | null) ?? null, by: (h['s' + i + '_by'] as string | null) ?? null };
  }
  return s;
};

/** 加工指示（刺繍・プリント）の読み書き */
@Injectable({
  providedIn: 'root'
})
export class KakoService {
  private apollo = inject(Apollo);
  private usrsrv = inject(UserService);

  /** 加工先の表示用の値（倉庫は 'S:01'、仕入先は 'V:1234'） */
  static destKey(dtype: string, dcode: string): string {
    return dtype + ':' + dcode;
  }

  /** 予定納期（依頼日から KAKO_DAYS 営業日後。土日・休日マスタを除く） */
  planDay(reqday: string): string {
    if (!reqday) {
      return '';
    }
    let d = new Date(reqday + 'T00:00:00');
    for (let i = 0; i < KAKO_DAYS; i++) {
      d = this.usrsrv.getNextday(d);
    }
    return this.usrsrv.formatDate(d);
  }

  /** 受注伝票（顧客・内勤・倉庫・明細） */
  async order(jdenno: number): Promise<KakoOrder | null> {
    const Get = gql`
      query kako_order($id: smallint!, $dno: Int!) {
        trjyuden_by_pk(id: $id, denno: $dno) {
          denno mcode tcode scode jdstatus
          msmember { sei mei }
          trjyumeis(order_by: {line: asc}) { line gcode gtext suu spec mmemo }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trjyuden_by_pk: {
      denno: number; mcode: string; tcode: string | null; scode: string | null; jdstatus: string | null;
      msmember: { sei: string | null; mei: string | null } | null;
      trjyumeis: { line: number; gcode: string; gtext: string | null; suu: number; spec: string | null; mmemo: string | null }[];
    } | null }>({ query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: jdenno } }));
    if (res.error) {
      throw res.error;
    }
    const j = res.data?.trjyuden_by_pk;
    if (!j) {
      return null;
    }
    return {
      denno: j.denno, mcode: j.mcode, mname: ((j.msmember?.sei ?? '') + ' ' + (j.msmember?.mei ?? '')).trim(),
      tcode: j.tcode ?? '', scode: j.scode ?? '', jdstatus: j.jdstatus,
      lines: j.trjyumeis.map(l => ({ line: l.line, gcode: l.gcode, gtext: l.gtext ?? '', suu: Number(l.suu ?? 0), spec: l.spec, mmemo: l.mmemo ?? '' }))
    };
  }

  async load(kno: number): Promise<KakoDen | null> {
    const Get = gql`
      query kako_load($id: smallint!, $kno: Int!) {
        trkako_by_pk(id: $id, kno: $kno) {
          ${HEAD}
          trkakomeis(order_by: {line: asc}) { line jline gcode gtext suu memo }
          trkakoposis(order_by: {line: asc}) { line posi naiyo shotai color size memo img }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trkako_by_pk: (HeadDb & {
      trkakomeis: { line: number; jline: number | null; gcode: string; gtext: string | null; suu: number; memo: string | null }[];
      trkakoposis: { line: number; posi: string | null; naiyo: string | null; shotai: string | null; color: string | null; size: string | null; memo: string | null; img: string | null }[];
    }) | null }>({ query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, kno } }));
    if (res.error) {
      throw res.error;
    }
    const h = res.data?.trkako_by_pk;
    if (!h) {
      return null;
    }
    return {
      ...this.head(h),
      rscode: (h['rscode'] as string | null) ?? '',
      created_at: h['created_at'] as string, created_by: h['created_by'] as string,
      updated_at: h['updated_at'] as string, updated_by: h['updated_by'] as string,
      lines: h.trkakomeis.map(l => ({ line: l.line, jline: l.jline, gcode: l.gcode, gtext: l.gtext ?? '', suu: Number(l.suu ?? 0), memo: l.memo ?? '' })),
      posis: h.trkakoposis.map(p => ({ line: p.line, posi: p.posi ?? '', naiyo: p.naiyo ?? '', shotai: p.shotai ?? '', color: p.color ?? '', size: p.size ?? '', memo: p.memo ?? '', img: p.img ?? '' }))
    };
  }

  private head(h: HeadDb) {
    return {
      kno: Number(h['kno']), jdenno: h['jdenno'] == null ? null : Number(h['jdenno']), mcode: (h['mcode'] as string) ?? '',
      mname: (h['mname'] as string) ?? '', kind: (h['kind'] as string) ?? '6', dtype: ((h['dtype'] as string) ?? 'S') as 'S' | 'V',
      dcode: (h['dcode'] as string) ?? '', renban: (h['renban'] as string) ?? '', tcode: (h['tcode'] as string) ?? '',
      reqday: d10(h['reqday']), wishday: d10(h['wishday']), planday: d10(h['planday']), doukon: !!h['doukon'],
      naiyo: (h['naiyo'] as string) ?? '', memo: (h['memo'] as string) ?? '', status: Number(h['status'] ?? 1),
      steps: stepsOf(h), del: !!h['del']
    };
  }

  /** 保存（新規は採番して登録、変更は見出しを直して商品・位置を入れ直す）。加工指示番号を返す */
  async save(d: KakoDen, isNew: boolean): Promise<number> {
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff?.code ?? '';
    const now = new Date();
    let kno = d.kno;
    if (isNew) {
      kno = Number(await this.usrsrv.getNumber(KAKO_NUMBER, 1));
      if (!kno) {
        throw new Error('加工指示番号を採番できませんでした（採番の種別 ' + KAKO_NUMBER + '）');
      }
    }
    const head = {
      jdenno: d.jdenno || null, mcode: d.mcode || null, mname: d.mname || null, kind: d.kind, dtype: d.dtype, dcode: d.dcode,
      rscode: d.rscode || null, tcode: d.tcode, reqday: d.reqday, wishday: d.wishday || null, planday: d.planday || null,
      doukon: d.doukon, naiyo: d.naiyo || null, memo: d.memo || null, updated_at: now, updated_by: by
    };
    const meis = d.lines.filter(l => l.gcode).map((l, i) => ({
      id, kno, line: i + 1, jline: l.jline, gcode: l.gcode, gtext: l.gtext || null, suu: Number(l.suu) || 0, memo: l.memo || null
    }));
    const posis = d.posis.filter(p => p.posi || p.naiyo || p.img).map((p, i) => ({
      id, kno, line: i + 1, posi: p.posi || null, naiyo: p.naiyo || null, shotai: p.shotai || null, color: p.color || null,
      size: p.size || null, memo: p.memo || null, img: p.img || null
    }));
    if (isNew) {
      const Ins = gql`
        mutation kako_ins($head: trkako_insert_input!, $meis: [trkakomei_insert_input!]!, $posis: [trkakoposi_insert_input!]!) {
          insert_trkako_one(object: $head) { kno }
          insert_trkakomei(objects: $meis) { affected_rows }
          insert_trkakoposi(objects: $posis) { affected_rows }
        }`;
      const res = await firstValueFrom(this.apollo.mutate({
        mutation: Ins,
        variables: { head: { id, kno, ...head, status: 1, created_at: now, created_by: by }, meis, posis }
      }));
      if (res.error) {
        throw res.error;
      }
    } else {
      // 商品・位置を入れ直してから見出しを直す（見出しの変更の操作ログが最後に 1 件残る）
      const Upd = gql`
        mutation kako_upd($id: smallint!, $kno: Int!, $set: trkako_set_input!, $meis: [trkakomei_insert_input!]!, $posis: [trkakoposi_insert_input!]!) {
          delete_trkakomei(where: {id: {_eq: $id}, kno: {_eq: $kno}}) { affected_rows }
          delete_trkakoposi(where: {id: {_eq: $id}, kno: {_eq: $kno}}) { affected_rows }
          insert_trkakomei(objects: $meis) { affected_rows }
          insert_trkakoposi(objects: $posis) { affected_rows }
          update_trkako_by_pk(pk_columns: {id: $id, kno: $kno}, _set: $set) { kno }
        }`;
      const res = await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { id, kno, set: head, meis, posis } }));
      if (res.error) {
        throw res.error;
      }
    }
    return kno;
  }

  /**
   * 状態を変える。進めるときはその段階の日時・担当を入れ、戻すときは戻した段階より後の日時・担当を消す。
   * by を省くとログインしている担当者
   */
  async setStatus(kno: number, to: number, from: number, by?: string): Promise<void> {
    const set: Record<string, unknown> = { status: to, updated_at: new Date(), updated_by: by ?? this.usrsrv.staff?.code ?? '' };
    if (to > from) {
      for (let s = Math.max(2, from + 1); s <= to; s++) {
        // 飛ばした段階は日時を入れない（進めた段階だけ）
        if (s == to) {
          set['s' + s + '_at'] = new Date();
          set['s' + s + '_by'] = by ?? this.usrsrv.staff?.code ?? '';
        }
      }
    } else {
      for (let s = to + 1; s <= 6; s++) {
        set['s' + s + '_at'] = null;
        set['s' + s + '_by'] = null;
      }
    }
    const Upd = gql`
      mutation kako_status($id: smallint!, $kno: Int!, $set: trkako_set_input!) {
        update_trkako_by_pk(pk_columns: {id: $id, kno: $kno}, _set: $set) { kno status }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { id: this.usrsrv.compid, kno, set } }));
    if (res.error) {
      throw res.error;
    }
  }

  /** 取消・取消の取り消し */
  async setDel(kno: number, del: boolean): Promise<void> {
    const Upd = gql`
      mutation kako_del($id: smallint!, $kno: Int!, $set: trkako_set_input!) {
        update_trkako_by_pk(pk_columns: {id: $id, kno: $kno}, _set: $set) { kno }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({
      mutation: Upd, variables: { id: this.usrsrv.compid, kno, set: { del, updated_at: new Date(), updated_by: this.usrsrv.staff?.code ?? '' } }
    }));
    if (res.error) {
      throw res.error;
    }
  }

  /** 一覧（依頼日の範囲・加工先・内勤・未完了・状態・伝票番号/顧客/連番の文字） */
  async search(f: KakoFilter): Promise<KakoRow[]> {
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }];
    if (f.from) {
      and.push({ reqday: { _gte: f.from } });
    }
    if (f.to) {
      and.push({ reqday: { _lte: f.to } });
    }
    if (f.dest) {
      const [dtype, dcode] = f.dest.split(':');
      and.push({ dtype: { _eq: dtype } }, { dcode: { _eq: dcode } });
    }
    if (f.tcode) {
      and.push({ tcode: { _eq: f.tcode } });
    }
    if (f.status) {
      and.push({ status: { _eq: f.status } });
    } else if (f.open) {
      and.push({ status: { _lt: 6 } }, { del: { _eq: false } });
    }
    const t = f.text.trim();
    if (t) {
      const or: object[] = [{ mname: { _ilike: '%' + t + '%' } }, { mcode: { _eq: t } }, { renban: { _eq: t } }];
      if (/^\d+$/.test(t)) {
        or.push({ jdenno: { _eq: Number(t) } }, { kno: { _eq: Number(t) } });
      }
      and.push({ _or: or });
    }
    const Get = gql`
      query kako_list($where: trkako_bool_exp!) {
        trkako(where: $where, order_by: [{reqday: desc}, {kno: desc}], limit: 1000) {
          ${HEAD}
          trkakomeis(order_by: {line: asc}) { gcode suu }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trkako: (HeadDb & { trkakomeis: { gcode: string; suu: number }[] })[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('加工指示を読めませんでした');
    }
    return res.data.trkako.map(h => ({
      ...this.head(h),
      gcodes: [...new Set(h.trkakomeis.map(m => m.gcode))].join('/'),
      suu: h.trkakomeis.reduce((a, m) => a + Number(m.suu ?? 0), 0)
    }));
  }

  /** 受注伝票の加工指示（受注伝票の画面・加工指示の画面で、同じ受注の指示を並べる） */
  async ofOrder(jdenno: number): Promise<KakoRow[]> {
    const Get = gql`
      query kako_of_order($id: smallint!, $dno: Int!) {
        trkako(where: {id: {_eq: $id}, jdenno: {_eq: $dno}}, order_by: {kno: asc}) {
          ${HEAD}
          trkakomeis(order_by: {line: asc}) { gcode suu }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trkako: (HeadDb & { trkakomeis: { gcode: string; suu: number }[] })[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: jdenno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('加工指示を読めませんでした');
    }
    return res.data.trkako.map(h => ({
      ...this.head(h),
      gcodes: [...new Set(h.trkakomeis.map(m => m.gcode))].join('/'),
      suu: h.trkakomeis.reduce((a, m) => a + Number(m.suu ?? 0), 0)
    }));
  }

  /**
   * 受注伝票が出荷済（完了）になった加工指示を「出荷済」にする（一覧を開いたときに行う）。直した件数を返す
   */
  async autoShipped(rows: KakoRow[]): Promise<number> {
    const targets = rows.filter(r => r.jdenno && r.status < 6 && !r.del);
    if (targets.length == 0) {
      return 0;
    }
    const Get = gql`
      query kako_shipped($id: smallint!, $dnos: [Int!]!, $st: [String!]!) {
        trjyuden(where: {id: {_eq: $id}, denno: {_in: $dnos}, jdstatus: {_in: $st}}) { denno }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trjyuden: { denno: number }[] }>({
      query: Get, fetchPolicy: 'network-only',
      variables: { id: this.usrsrv.compid, dnos: [...new Set(targets.map(r => r.jdenno!))], st: [JDST.KANRYO] }
    }));
    if (res.error || !res.data) {
      return 0;
    }
    const done = new Set(res.data.trjyuden.map(j => j.denno));
    let n = 0;
    for (const r of targets.filter(t => done.has(t.jdenno!))) {
      await this.setStatus(r.kno, 6, r.status, 'auto');
      r.status = 6;
      r.steps[6] = { at: new Date().toISOString(), by: 'auto' };
      n++;
    }
    return n;
  }
}
