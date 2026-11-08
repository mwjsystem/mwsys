import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JyuStockService } from './../services/jyustock.service';
import { JyuDefaultService, SKBN_URIAGE } from './../services/jyudefault.service';
import { JDST } from './../frmship/ship-forms';
import { lineMoney } from './../frmamazon/amazon-parse';
import { ItOrder, IT_DEFAULT_SCODE } from './it-parse';

/** 受注先（株式会社アイ・アンド・ティー） */
export const IT_MCODE = '404181';
export const IT_NAME = '株式会社アイ・アンド・ティー';
/** 送り状備考 */
const IT_OMEMO = '株式会社アイ・アンド・ティー取扱';
/** 明細の税区分（0：外税） */
const IT_MTAX = '0';
const KEY_DENNO = 'jdenno';

/** 受注先の直近の受注伝票（伝票の区分・担当者などをこれに合わせる） */
interface LastJyuden {
  scde: string | null; iadr: number | null; tcode: string | null; tcode1: string | null;
  daibunrui: string | null; chubunrui: string | null; shobunrui: string | null;
  jcode: string | null; pcode: string | null; bcode: string | null; bkcode: string | null; hcode: string | null; buntype: string | null;
  torikbn: boolean | null;
}
interface MemberRow { mcode: string }
interface MadrRow { eda: number; zip: string | null; street: string | null; adrname: string | null }
interface GoodsRow { gcode: string; gtext: string | null; jan: string | null; msgtankas: { tanka3: number | null; genka: number | null; taxrate: string | null }[] }

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t == '' ? null : t;
};
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').replace(/[\s　-]/g, '') == (b ?? '').replace(/[\s　-]/g, '');

/**
 * I&T 受注の取込（現行の I&T受注テキスト変換.xlsm の置き換え）。注文No. ごとに 1 伝票・1 トランザクションで登録する。
 * 単価は商品マスタの代理店単価（tanka3）、納品先は CSV の納入先（受注先の住所に無ければ追加する）。
 */
@Injectable({
  providedIn: 'root'
})
export class ItService {
  private usrsrv = inject(UserService);
  private stksrv = inject(JyuStockService);
  private defsrv = inject(JyuDefaultService);
  private apollo = inject(Apollo);

  private last: LastJyuden | null = null;

  private async query<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    return res.data as T;
  }

  /** 伝票の設定（直近の受注伝票）・商品・登録済みを DB で解決する。商品は JAN、無ければ貴社品番を商品コードとして探す */
  async resolve(orders: ItOrder[], today: string): Promise<void> {
    const Get = gql`
      query get_it_master($id: smallint!, $mcode: String!, $jans: [String!]!, $gcodes: [String!]!, $nos: [String!]!, $day: date!) {
        msmember_by_pk(id: $id, mcode: $mcode) { mcode }
        last: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {denno: desc}, limit: 1) {
          scde iadr tcode tcode1 daibunrui chubunrui shobunrui jcode pcode bcode bkcode hcode buntype torikbn
        }
        msgoods(where: {id: {_eq: $id}, _or: [{jan: {_in: $jans}}, {gcode: {_in: $gcodes}}]}, order_by: {gcode: asc}) {
          gcode gtext jan
          msgtankas(limit: 1, where: {day: {_lte: $day}}, order_by: {day: desc}) { tanka3 genka taxrate }
        }
        done: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, cusden: {_in: $nos}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}) { cusden denno }
      }`;
    const lines = orders.flatMap(o => o.lines);
    const jans = [...new Set(lines.map(l => l.jan).filter(e => e))];
    const gcodes = [...new Set(lines.map(l => l.hinban).filter(e => e))];
    const q = await this.query<{ msmember_by_pk: MemberRow | null; last: LastJyuden[]; msgoods: GoodsRow[]; done: { cusden: string; denno: number }[] }>(
      Get, { id: this.usrsrv.compid, mcode: IT_MCODE, jans, gcodes, nos: orders.map(o => o.no), day: today });
    if (!q.msmember_by_pk) {
      throw new Error('顧客マスタに ' + IT_NAME + '（' + IT_MCODE + '）がありません');
    }
    this.last = q.last[0] ?? null;
    if (!this.last) {
      throw new Error(IT_NAME + '（' + IT_MCODE + '）の受注伝票がありません（伝票の区分・担当者などを合わせる元がありません）');
    }
    const byJan = new Map<string, GoodsRow[]>();
    q.msgoods.forEach(g => {
      if (g.jan) {
        byJan.set(g.jan, [...(byJan.get(g.jan) ?? []), g]);
      }
    });
    const byCode = new Map(q.msgoods.map(g => [g.gcode, g]));
    for (const o of orders) {
      const errs: string[] = o.err ? [o.err] : [];
      const done = q.done.find(e => e.cusden == o.no);
      if (done) {
        o.result = '登録済（伝票番号 ' + done.denno + '）';
        o.denno = done.denno;
      }
      for (const l of o.lines) {
        const hit = byJan.get(l.jan) ?? [];
        if (hit.length > 1) {
          errs.push('JAN ' + l.jan + ' の商品が複数あります（' + hit.map(g => g.gcode).join('、') + '）');
          continue;
        }
        const g = hit[0] ?? byCode.get(l.hinban);
        if (!g) {
          errs.push('JAN ' + l.jan + '（貴社品番 ' + l.hinban + '）の商品がありません');
          continue;
        }
        const t = g.msgtankas[0];
        l.gcode = g.gcode;
        l.gtext = g.gtext ?? l.name;
        l.tanka3 = t?.tanka3 != null ? Number(t.tanka3) : null;
        l.genka = Number(t?.genka ?? 0);
        l.taxrate = Number(t?.taxrate ?? 10) || 10;
        if (l.tanka3 == null) {
          errs.push(g.gcode + ' の代理店単価がありません');
        }
      }
      o.err = errs.join('／');
    }
  }

  /** 1 件（1 注文）を登録する。today は受注日。結果の文字列を返す */
  async register(o: ItOrder, today: string): Promise<string> {
    const l0 = this.last;
    if (!l0 || o.err) {
      throw new Error(o.err || '直近の受注伝票が読めていません');
    }
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();

    // 1. 二重登録の確認（画面を開いたあとに登録されたものも見る）
    const Check = gql`
      query get_it_check($id: smallint!, $mcode: String!, $no: String!) {
        trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, cusden: {_eq: $no}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
        msmadr(where: {id: {_eq: $id}, mcode: {_eq: $mcode}}, order_by: {eda: asc}) { eda zip street adrname }
      }`;
    const chk = await this.query<{ trjyuden: { denno: number }[]; msmadr: MadrRow[] }>(Check, { id, mcode: IT_MCODE, no: o.no });
    if (chk.trjyuden.length > 0) {
      o.denno = chk.trjyuden[0].denno;
      return 'スキップ（既存 伝票番号 ' + o.denno + '）';
    }

    // 2. 商品マスタの確認（使えない商品があれば採番より前に止める）
    const st = await this.stksrv.check([...new Set(o.lines.map(l => l.gcode))]);

    // 3. 納品先（受注先の住所に同じものがあれば使い、無ければ追加する。枝番 0:本人 1:請求先 のため 2 から）
    const newMadr: object[] = [];
    const hit = chk.msmadr.find(e => Number(e.eda) >= 2 && same(e.zip, o.zip) && same(e.street, o.addr) && same(e.adrname, o.name));
    let nadr: number;
    if (hit) {
      nadr = Number(hit.eda);
    } else {
      nadr = Math.max(1, ...chk.msmadr.map(e => Number(e.eda))) + 1;
      newMadr.push({
        id, mcode: IT_MCODE, eda: nadr, zip: nz(o.zip), region: nz(o.pref), street: nz(o.addr),
        extend2: nz((o.company + ' ' + o.busho).trim()), tel: nz(o.tel), adrname: nz(o.name) ?? nz(o.company), del: false
      });
    }

    // 4. 伝票番号
    const denno = await this.usrsrv.getNumber(KEY_DENNO, 1);
    if (!denno) {
      throw new Error('伝票番号を採番できませんでした');
    }

    // 5. 明細・明細在庫・在庫（単価は代理店単価。倉庫は明細ごと）
    let gtotal = 0, taxtotal = 0, genka = 0, total8 = 0, total10 = 0;
    const mei = o.lines.map((l, i) => {
      const tanka = l.tanka3 ?? 0;
      const { money, tax } = lineMoney(tanka, l.qty, l.taxrate);
      gtotal += money;
      taxtotal += tax;
      genka += l.genka * l.qty;
      if (l.taxrate == 8) {
        total8 += money + tax;
      } else {
        total10 += money + tax;
      }
      return {
        id, denno, line: i + 1, scode: l.scode || IT_DEFAULT_SCODE, gcode: l.gcode, gtext: nz(l.gtext), suu: l.qty, tanka, money,
        toutmoney: money, tinmoney: money + tax, taxmoney: tax, taxrate: String(l.taxrate), mtax: IT_MTAX,
        genka: l.genka, tgenka: l.genka * l.qty, mmemo: i == 0 ? o.no : null, gskbn: st.gsk.get(l.gcode), del: false
      };
    });
    const mzai: object[] = [];
    const zinit: object[] = [];
    const zinc: object[] = [];
    for (const sc of [...new Set(mei.map(e => e.scode))]) {
      const r = this.stksrv.rows(st, denno, sc, today, mei.filter(e => e.scode == sc));
      mzai.push(...r.mzai);
      zinit.push(...r.zinit);
      zinc.push(...r.zinc);
    }

    // 6. 受注伝票（区分・担当者・配送方法などは直近の受注伝票に合わせる）
    const jyuden = {
      id, denno, day: today, mcode: IT_MCODE, scde: l0.scde ?? IT_MCODE, ncode: IT_MCODE, nadr, iadr: l0.iadr,
      scode: mei[0].scode, tcode: l0.tcode, tcode1: l0.tcode1,
      daibunrui: l0.daibunrui, chubunrui: l0.chubunrui, shobunrui: l0.shobunrui,
      jcode: l0.jcode, pcode: l0.pcode, bcode: l0.bcode, bkcode: l0.bkcode, hcode: l0.hcode, buntype: l0.buntype,
      skbn: SKBN_URIAGE, yday: this.defsrv.yday(), cusden: o.no,
      dmemo: nz(o.bikou), omemo: IT_OMEMO,
      gtotalzn: gtotal, soryozn: 0, tesuzn: 0, nebikizn: 0, taxtotal, total: gtotal + taxtotal, total8, total10, genka,
      torikbn: !!l0.torikbn, jdstatus: JDST.TOROKU, del: false,
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };

    // 7. 登録（住所・伝票・明細・明細在庫・在庫を 1 トランザクションで）
    const Insert = gql`
      mutation it_insert(
        $madr: [msmadr_insert_input!]!, $jyuden: trjyuden_insert_input!, $jyumei: [trjyumei_insert_input!]!,
        $jyumzai: [trjyumzai_insert_input!]!, $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!
      ) {
        insert_msmadr(objects: $madr) { affected_rows }
        insert_trjyuden_one(object: $jyuden) { denno }
        insert_trjyumei(objects: $jyumei) { affected_rows }
        insert_trjyumzai(objects: $jyumzai) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({
      mutation: Insert, variables: { madr: newMadr, jyuden, jyumei: mei, jyumzai: mzai, zinit, zinc }
    }));
    if (res.error) {
      throw new Error(res.error.message);
    }
    o.denno = denno;
    return '登録済' + (hit ? '' : '（納品先 住所 ' + nadr + ' を追加）');
  }
}
