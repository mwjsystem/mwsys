import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JyuStockService } from './../services/jyustock.service';
import { JDST } from './../frmship/ship-forms';
import { AMAZON_MCODE } from './../share/amazon';
import { AmzOrder, lineMoney } from './amazon-parse';
/** 倉庫（受注伝票・明細・在庫の scode） */
const AMZ_SCODE = '01';
/** 受注方法（9：WEB）・媒体 */
const AMZ_JCODE = '9';
const AMZ_BCODE = '01';
/** 明細の税区分（0：外税） */
const AMZ_MTAX = '0';
const KEY_DENNO = 'jdenno';

interface MemberRow { mcode: string; sei: string | null; tcode: string | null; tcode1: string | null; daibunrui: string | null; chubunrui: string | null; pcode: string | null; torikbn: boolean | null }
interface MadrRow { eda: number; nmemo: string | null; adrname: string | null }
interface GoodsRow { gcode: string; gtext: string | null; jan: string | null; msgtankas: { tanka3: number | null; genka: number | null; taxrate: string | null }[] }

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t == '' ? null : t;
};

/** Amazon 受注の取込（現行の amazon受注テキスト変換.xlsm）。PO ごとに 1 伝票・1 トランザクションで登録する */
@Injectable({
  providedIn: 'root'
})
export class AmazonService {
  private usrsrv = inject(UserService);
  private stksrv = inject(JyuStockService);
  private apollo = inject(Apollo);

  private member: MemberRow | null = null;

  private async query<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    return res.data as T;
  }

  /**
   * 納品先・商品・登録済みを DB で解決する。
   * 納品先は Amazon の住所のうち、備考（nmemo）がセンターコードで始まるもの。商品は JAN で探す
   */
  async resolve(orders: AmzOrder[], today: string): Promise<void> {
    const Get = gql`
      query get_amz_master($id: smallint!, $mcode: String!, $jans: [String!]!, $pos: [String!]!, $day: date!) {
        msmember_by_pk(id: $id, mcode: $mcode) { mcode sei tcode tcode1 daibunrui chubunrui pcode torikbn }
        msmadr(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {eda: asc}) { eda nmemo adrname }
        msgoods(where: {id: {_eq: $id}, jan: {_in: $jans}}, order_by: {gcode: asc}) {
          gcode gtext jan
          msgtankas(limit: 1, where: {day: {_lte: $day}}, order_by: {day: desc}) { tanka3 genka taxrate }
        }
        trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, cusden: {_in: $pos}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}) { cusden denno }
      }`;
    const jans = [...new Set(orders.flatMap(o => o.lines.map(l => l.jan)).filter(e => e))];
    const q = await this.query<{ msmember_by_pk: MemberRow | null; msmadr: MadrRow[]; msgoods: GoodsRow[]; trjyuden: { cusden: string; denno: number }[] }>(
      Get, { id: this.usrsrv.compid, mcode: AMAZON_MCODE, jans, pos: orders.map(o => o.po), day: today });
    this.member = q.msmember_by_pk;
    if (!this.member) {
      throw new Error('顧客マスタに Amazon（' + AMAZON_MCODE + '）がありません');
    }
    const byJan = new Map<string, GoodsRow[]>();
    q.msgoods.forEach(g => {
      const list = byJan.get(g.jan ?? '') ?? [];
      list.push(g);
      byJan.set(g.jan ?? '', list);
    });
    for (const o of orders) {
      const errs: string[] = [];
      const done = q.trjyuden.find(e => e.cusden == o.po);
      if (done) {
        o.result = '登録済（伝票番号 ' + done.denno + '）';
        o.denno = done.denno;
      }
      const adr = q.msmadr.find(a => o.center && (a.nmemo ?? '').trim().toUpperCase().startsWith(o.center.toUpperCase()));
      if (adr) {
        o.nadr = Number(adr.eda);
        o.nname = adr.adrname ?? '';
      } else {
        errs.push('納品先（' + o.center + '）が顧客マスタにありません');
      }
      if (o.lines.length == 0) {
        errs.push('受領予定の数量がすべて 0 です');
      }
      for (const l of o.lines) {
        const hit = byJan.get(l.jan) ?? [];
        if (hit.length == 0) {
          errs.push('JAN ' + l.jan + ' の商品がありません');
          continue;
        }
        if (hit.length > 1) {
          errs.push('JAN ' + l.jan + ' の商品が複数あります（' + hit.map(g => g.gcode).join('、') + '）');
          continue;
        }
        const g = hit[0];
        const t = g.msgtankas[0];
        l.gcode = g.gcode;
        l.gtext = g.gtext ?? '';
        l.tanka3 = t?.tanka3 != null ? Number(t.tanka3) : null;
        l.genka = Number(t?.genka ?? 0);
        l.taxrate = Number(t?.taxrate ?? 10) || 10;
      }
      o.err = errs.join('／');
    }
  }

  /** 1 件（1 PO）を登録する。結果の文字列を返す */
  async register(o: AmzOrder, today: string): Promise<string> {
    const m = this.member;
    if (!m || o.err || o.nadr == null) {
      throw new Error(o.err || '納品先が決まっていません');
    }
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();

    // 二重登録の確認（画面を開いたあとに登録されたものも見る）
    const Check = gql`
      query get_amz_check($id: smallint!, $mcode: String!, $po: String!) {
        trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, cusden: {_eq: $po}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
      }`;
    const chk = await this.query<{ trjyuden: { denno: number }[] }>(Check, { id, mcode: AMAZON_MCODE, po: o.po });
    if (chk.trjyuden.length > 0) {
      o.denno = chk.trjyuden[0].denno;
      return 'スキップ（既存 伝票番号 ' + o.denno + '）';
    }

    const st = await this.stksrv.check([...new Set(o.lines.map(l => l.gcode))]);
    const denno = await this.usrsrv.getNumber(KEY_DENNO, 1);
    if (!denno) {
      throw new Error('伝票番号を採番できませんでした');
    }

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
        id, denno, line: i + 1, scode: AMZ_SCODE, gcode: l.gcode, gtext: nz(l.gtext), suu: l.qty, tanka: l.price, money,
        toutmoney: money, tinmoney: money + tax, taxmoney: tax, taxrate: String(l.taxrate), mtax: AMZ_MTAX,
        genka: l.genka, tgenka: l.genka * l.qty, tanka1: l.tanka3, mmemo: i == 0 ? 'PO:' + o.po : null,
        gskbn: st.gsk.get(l.gcode), del: false
      };
    });
    const { mzai, zinit, zinc } = this.stksrv.rows(st, denno, AMZ_SCODE, today, mei);

    const window = o.from ? '着荷ウィンドウ ' + o.from.replace(/-/g, '/') + (o.to && o.to != o.from ? '～' + o.to.replace(/-/g, '/') : '') : '';
    const jyuden = {
      id, denno, day: today, hday: o.from, mcode: AMAZON_MCODE, scde: AMAZON_MCODE, ncode: AMAZON_MCODE, nadr: o.nadr, scode: AMZ_SCODE,
      tcode: nz(m.tcode), tcode1: nz(m.tcode1), daibunrui: nz(m.daibunrui), chubunrui: nz(m.chubunrui),
      jcode: AMZ_JCODE, pcode: nz(m.pcode), bcode: AMZ_BCODE, bkcode: AMZ_BCODE, cusden: o.po,
      dmemo: nz(['Amazon PO ' + o.po, o.centerName, window].filter(e => e).join(' ')),
      gtotalzn: gtotal, soryozn: 0, tesuzn: 0, nebikizn: 0, taxtotal, total: gtotal + taxtotal, total8, total10, genka,
      torikbn: !!m.torikbn, jdstatus: JDST.TOROKU, del: false,
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };

    const Insert = gql`
      mutation amz_insert(
        $jyuden: trjyuden_insert_input!, $jyumei: [trjyumei_insert_input!]!, $jyumzai: [trjyumzai_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!
      ) {
        insert_trjyuden_one(object: $jyuden) { denno }
        insert_trjyumei(objects: $jyumei) { affected_rows }
        insert_trjyumzai(objects: $jyumzai) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Insert, variables: { jyuden, jyumei: mei, jyumzai: mzai, zinit, zinc } }));
    if (res.error) {
      throw new Error(res.error.message);
    }
    o.denno = denno;
    return '登録済';
  }
}
