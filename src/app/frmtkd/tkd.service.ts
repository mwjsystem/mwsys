import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JyuStockService } from './../services/jyustock.service';
import { JDST } from './../frmship/ship-forms';
import { lineMoney } from './../frmamazon/amazon-parse';
import { TkdOrder, monthEnd } from './tkd-parse';

/** 受注先（株式会社東海堂 Ｙ） */
export const TKD_MCODE = '409535';
/** 出荷対象区分（分類マスタ kubun = 'skbn'）の売上のみ。在庫・出荷の対象にしない */
const SKBN_URIONLY = '1';
/** 明細の税区分（0：外税。Excel の単価は税抜） */
const TKD_MTAX = '0';
const KEY_DENNO = 'jdenno';

/** 東海堂 Ｙ の直近の受注伝票（伝票の区分・担当者などをこれに合わせる） */
interface LastJyuden {
  scde: string | null; ncode: string | null; nadr: number | null; iadr: number | null; scode: string | null;
  tcode: string | null; tcode1: string | null; daibunrui: string | null; chubunrui: string | null; shobunrui: string | null;
  jcode: string | null; pcode: string | null; bcode: string | null; bkcode: string | null; hcode: string | null; buntype: string | null;
  torikbn: boolean | null;
}
interface GoodsRow { gcode: string; msgtankas: { genka: number | null; taxrate: string | null }[] }

/**
 * TKD（東海堂 Ｙ）の請求 Excel の取込（現行の TH_TKD伝票登録03.xlsm の置き換え）。
 * 日付ごとに 1 伝票・1 トランザクションで登録する。出荷区分は売上のみ（在庫は動かさない・出荷指示の対象にしない）、
 * 受注日は Excel の日付、売上日はその月の月末（月初に前月分を処理するので、処理日から見て前月末）。
 */
@Injectable({
  providedIn: 'root'
})
export class TkdService {
  private usrsrv = inject(UserService);
  private stksrv = inject(JyuStockService);
  private apollo = inject(Apollo);

  private last: LastJyuden | null = null;

  private async query<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    return res.data as T;
  }

  /** 伝票の設定（直近の受注伝票）・商品・登録済みを DB で解決する */
  async resolve(orders: TkdOrder[]): Promise<void> {
    const Get = gql`
      query get_tkd_master($id: smallint!, $mcode: String!, $gcodes: [String!]!, $day: date!, $memos: [String!]!) {
        last: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {denno: desc}, limit: 1) {
          scde ncode nadr iadr scode tcode tcode1 daibunrui chubunrui shobunrui jcode pcode bcode bkcode hcode buntype torikbn
        }
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
          gcode
          msgtankas(limit: 1, where: {day: {_lte: $day}}, order_by: {day: desc}) { genka taxrate }
        }
        done: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, dmemo: {_in: $memos}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}) { dmemo denno }
      }`;
    const gcodes = [...new Set(orders.flatMap(o => o.lines.map(l => l.gcode)))];
    const day = orders.map(o => o.day).sort().slice(-1)[0];
    const q = await this.query<{ last: LastJyuden[]; msgoods: GoodsRow[]; done: { dmemo: string; denno: number }[] }>(
      Get, { id: this.usrsrv.compid, mcode: TKD_MCODE, gcodes, day, memos: orders.map(o => o.dmemo) });
    this.last = q.last[0] ?? null;
    if (!this.last) {
      throw new Error('東海堂 Ｙ（' + TKD_MCODE + '）の受注伝票がありません（伝票の区分・担当者などを合わせる元がありません）');
    }
    const goods = new Map(q.msgoods.map(g => [g.gcode, g]));
    for (const o of orders) {
      const done = q.done.find(e => (e.dmemo ?? '').trim() == o.dmemo);
      if (done) {
        o.result = '登録済（伝票番号 ' + done.denno + '）';
        o.denno = done.denno;
      }
      const missing = new Set<string>();
      for (const l of o.lines) {
        const g = goods.get(l.gcode);
        if (!g) {
          missing.add(l.gcode);
          continue;
        }
        const t = g.msgtankas[0];
        l.genka = Number(t?.genka ?? 0);
        l.taxrate = Number(t?.taxrate ?? 10) || 10;
      }
      if (missing.size > 0) {
        o.err = (o.err ? o.err + '／' : '') + '商品マスタに無い品番：' + [...missing].join('、');
      }
    }
  }

  /** 1 件（1 日分）を登録する。結果の文字列を返す */
  async register(o: TkdOrder): Promise<string> {
    const m = this.last;
    if (!m || o.err) {
      throw new Error(o.err || '伝票の設定が読めていません');
    }
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();

    // 二重登録の確認（画面を開いたあとに登録されたものも見る）
    const Check = gql`
      query get_tkd_check($id: smallint!, $mcode: String!, $memo: String!) {
        trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, dmemo: {_eq: $memo}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
      }`;
    const chk = await this.query<{ trjyuden: { denno: number }[] }>(Check, { id, mcode: TKD_MCODE, memo: o.dmemo });
    if (chk.trjyuden.length > 0) {
      o.denno = chk.trjyuden[0].denno;
      return 'スキップ（既存 伝票番号 ' + o.denno + '）';
    }

    // 商品マスタの確認（使えない商品があれば採番より前に止める）
    const st = await this.stksrv.check([...new Set(o.lines.map(l => l.gcode))]);
    const denno = await this.usrsrv.getNumber(KEY_DENNO, 1);
    if (!denno) {
      throw new Error('伝票番号を採番できませんでした');
    }
    const scode = m.scode ?? '01';

    let gtotal = 0, taxtotal = 0, genka = 0, total8 = 0, total10 = 0;
    const mei = o.lines.map((l, i) => {
      const { money, tax } = lineMoney(l.price, l.qty, l.taxrate);
      gtotal += money;
      taxtotal += tax;
      genka += l.genka * l.qty;
      if (l.taxrate == 8) {
        total8 += money + tax;
      } else {
        total10 += money + tax;
      }
      return {
        id, denno, line: i + 1, scode, gcode: l.gcode, gtext: l.gtext || null, suu: l.qty, tanka: l.price, money,
        toutmoney: money, tinmoney: money + tax, taxmoney: tax, taxrate: String(l.taxrate), mtax: TKD_MTAX,
        genka: l.genka, tgenka: l.genka * l.qty, mmemo: l.memo || null, gskbn: st.gsk.get(l.gcode), del: false
      };
    });
    // 売上のみなので在庫（受注数）は動かさない。明細在庫は受注伝票画面と同じく作る
    const { mzai } = this.stksrv.rows(st, denno, scode, o.day, mei);

    const jyuden = {
      id, denno, day: o.day, uday: monthEnd(o.day), mcode: TKD_MCODE, scde: m.scde ?? TKD_MCODE, ncode: m.ncode ?? TKD_MCODE,
      nadr: m.nadr ?? 0, iadr: m.iadr, scode, tcode: m.tcode, tcode1: m.tcode1, daibunrui: m.daibunrui, chubunrui: m.chubunrui,
      shobunrui: m.shobunrui, jcode: m.jcode, pcode: m.pcode, bcode: m.bcode, bkcode: m.bkcode, hcode: m.hcode, buntype: m.buntype,
      skbn: SKBN_URIONLY, dmemo: o.dmemo,
      gtotalzn: gtotal, soryozn: 0, tesuzn: 0, nebikizn: 0, taxtotal, total: gtotal + taxtotal, total8, total10, genka,
      torikbn: !!m.torikbn, jdstatus: JDST.TOROKU, del: false,
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };

    const Insert = gql`
      mutation tkd_insert($jyuden: trjyuden_insert_input!, $jyumei: [trjyumei_insert_input!]!, $jyumzai: [trjyumzai_insert_input!]!) {
        insert_trjyuden_one(object: $jyuden) { denno }
        insert_trjyumei(objects: $jyumei) { affected_rows }
        insert_trjyumzai(objects: $jyumzai) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Insert, variables: { jyuden, jyumei: mei, jyumzai: mzai } }));
    if (res.error) {
      throw new Error(res.error.message);
    }
    o.denno = denno;
    return '登録済';
  }
}
