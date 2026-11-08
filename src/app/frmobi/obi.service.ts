import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JyuStockService } from './../services/jyustock.service';
import { JyuDefaultService, SKBN_URIAGE } from './../services/jyudefault.service';
import { JDST } from './../frmship/ship-forms';
import { lineMoney } from './../frmrakuten/rakuten-parse';
import { ObiOrder, OBI_DEFAULT_SCODE } from './obi-parse';

/** 受注方法（4：メール。現行マクロと同じ） */
const OBI_JCODE = '4';
/** 直近の受注伝票が無いときの納品書タイプ（1：納品書のみ） */
const OBI_BUNTYPE = 1;
const KEY_DENNO = 'jdenno';

type TankaKey = 'tanka1' | 'tanka2' | 'tanka3' | 'tanka4' | 'tanka5' | 'tanka6' | 'tanka7' | 'tanka8' | 'tanka9';

interface MemberRow {
  mcode: string; sei: string | null; mei: string | null; del: boolean | null; tankakbn: string | null; sptnkbn: string | null; mtax: string | null;
  torikbn: boolean | null; scde: string | null; pcode: string | null; hcode: string | null; tcode: string | null; tcode1: string | null;
  daibunrui: string | null; chubunrui: string | null; shobunrui: string | null;
}
interface LastJyuden { iadr: number | null; bcode: string | null; bkcode: string | null; hcode: string | null; buntype: string | null }
type Tankas = Record<TankaKey, number | null> & { genka: number | null; taxrate: string | null };
interface GoodsRow {
  gcode: string; gtext: string | null; msggroup: { gkbn: string | null } | null;
  msgtankas: Tankas[]; msgsptnks: { sptanka: number | null }[];
}

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t == '' ? null : t;
};

/** 解決した顧客・商品（登録で使う） */
interface Resolved {
  member: MemberRow;
  last: LastJyuden | null;
  gkbn: Map<string, string>;
}

/**
 * 帯の注文用紙の取込（第 1 段階：色帯の表）。1 用紙 = 1 伝票・1 トランザクションで登録する。
 * 単価は受注伝票画面と同じく、顧客の特別単価区分の単価があればそれ、無ければ単価区分の単価。税区分は顧客の税区分
 */
@Injectable({
  providedIn: 'root'
})
export class ObiService {
  private usrsrv = inject(UserService);
  private stksrv = inject(JyuStockService);
  private defsrv = inject(JyuDefaultService);
  private apollo = inject(Apollo);

  private resolved = new WeakMap<ObiOrder, Resolved>();

  private async query<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    return res.data as T;
  }

  /** 伝票備考（取込元の用紙。二重登録の確認にも使う） */
  dmemo(o: ObiOrder): string {
    return ('帯注文 ' + o.fileName.replace(/\.xlsx?$/i, '') + (o.bikou ? ' ' + o.bikou : '')).slice(0, 200);
  }

  /** 顧客・単価・登録済みを DB で解決する（顧客コード・種類を変えたら呼び直す） */
  async resolve(o: ObiOrder, today: string): Promise<void> {
    this.resolved.delete(o);
    o.mname = '';
    o.result = '';
    o.denno = null;
    const errs: string[] = [];
    const mcode = (o.mcode ?? '').trim();
    o.err = o.perr;
    if (!mcode) {
      o.err = [o.perr, '顧客コードを入れてください'].filter(e => e).join('／');
      return;
    }
    const GetM = gql`
      query get_obi_member($id: smallint!, $mcode: String!, $day: date!, $memo: String!) {
        msmember_by_pk(id: $id, mcode: $mcode) {
          mcode sei mei del tankakbn sptnkbn mtax torikbn scde pcode hcode tcode tcode1 daibunrui chubunrui shobunrui
        }
        last: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {denno: desc}, limit: 1) {
          iadr bcode bkcode hcode buntype
        }
        done: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, day: {_eq: $day}, dmemo: {_eq: $memo}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
      }`;
    const qm = await this.query<{ msmember_by_pk: MemberRow | null; last: LastJyuden[]; done: { denno: number }[] }>(
      GetM, { id: this.usrsrv.compid, mcode, day: today, memo: this.dmemo(o) });
    const m = qm.msmember_by_pk;
    if (!m || m.del) {
      o.err = [o.perr, '顧客コード ' + mcode + ' が顧客マスタにありません'].filter(e => e).join('／');
      return;
    }
    o.mname = ((m.sei ?? '') + ' ' + (m.mei ?? '')).trim();
    if (qm.done.length > 0) {
      o.denno = qm.done[0].denno;
      o.result = '登録済（伝票番号 ' + o.denno + '）';
    }

    const GetG = gql`
      query get_obi_goods($id: smallint!, $gcodes: [String!]!, $day: date!, $sptnk: String) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
          gcode gtext
          msggroup { gkbn }
          msgtankas(limit: 1, where: {day: {_lt: $day}}, order_by: {day: desc_nulls_last}) {
            tanka1 tanka2 tanka3 tanka4 tanka5 tanka6 tanka7 tanka8 tanka9 genka taxrate
          }
          msgsptnks(limit: 1, where: {day: {_lt: $day}, sptnkbn: {_eq: $sptnk}}, order_by: {day: desc_nulls_last}) { sptanka }
        }
      }`;
    const gcodes = [...new Set(o.lines.map(l => l.gcode))];
    const qg = await this.query<{ msgoods: GoodsRow[] }>(GetG, { id: this.usrsrv.compid, gcodes, day: today, sptnk: nz(m.sptnkbn) ?? '' });
    const goods = new Map(qg.msgoods.map(g => [g.gcode, g]));
    const key = ('tanka' + (nz(m.tankakbn) ?? '1')) as TankaKey;
    const missing: string[] = [];
    const gkbn = new Map<string, string>();
    for (const l of o.lines) {
      const g = goods.get(l.gcode);
      if (!g) {
        missing.push(l.gcode);
        continue;
      }
      const t = g.msgtankas[0];
      l.gtext = g.gtext ?? '';
      l.taxrate = Number(t?.taxrate ?? 10) || 10;
      l.genka = Number(t?.genka ?? 0);
      l.tanka = l.fixed ?? Number(g.msgsptnks[0]?.sptanka ?? t?.[key] ?? 0);
      gkbn.set(l.gcode, (g.msggroup?.gkbn ?? '0').trim() || '0');
      if (!t) {
        errs.push(l.gcode + ' の単価がありません');
      }
    }
    if (missing.length > 0) {
      errs.push('商品マスタに無い商品コード：' + missing.join('、'));
    }
    o.err = [o.perr, ...errs].filter(e => e).join('／');
    this.resolved.set(o, { member: m, last: qm.last[0] ?? null, gkbn });
  }

  /** 明細の税区分（顧客の税区分。0：外税 1：内税） */
  mtax(o: ObiOrder): string {
    return nz(this.resolved.get(o)?.member.mtax) ?? '0';
  }

  /** 1 件（1 用紙）を登録する。today は受注日。結果の文字列を返す */
  async register(o: ObiOrder, today: string): Promise<string> {
    const rs = this.resolved.get(o);
    if (!rs || o.err) {
      throw new Error(o.err || '顧客・単価を確認してください');
    }
    const m = rs.member;
    const l0 = rs.last;
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();
    const dmemo = this.dmemo(o);

    // 1. 二重登録の確認（同じ顧客・同じ日・同じ用紙）
    const Check = gql`
      query get_obi_check($id: smallint!, $mcode: String!, $day: date!, $memo: String!) {
        trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, day: {_eq: $day}, dmemo: {_eq: $memo}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
      }`;
    const chk = await this.query<{ trjyuden: { denno: number }[] }>(Check, { id, mcode: m.mcode, day: today, memo: dmemo });
    if (chk.trjyuden.length > 0) {
      o.denno = chk.trjyuden[0].denno;
      return 'スキップ（既存 伝票番号 ' + o.denno + '）';
    }

    // 2. 商品マスタの確認（使えない商品があれば採番より前に止める）
    const st = await this.stksrv.check([...new Set(o.lines.map(l => l.gcode))]);
    const buntype = l0?.buntype ?? await this.defsrv.buntype(OBI_BUNTYPE);
    const denno = await this.usrsrv.getNumber(KEY_DENNO, 1);
    if (!denno) {
      throw new Error('伝票番号を採番できませんでした');
    }

    // 3. 明細・明細在庫・在庫（倉庫は明細ごと）
    const mtax = nz(m.mtax) ?? '0';
    let gtotalzn = 0, soryozn = 0, tesuzn = 0, nebikizn = 0, taxtotal = 0, genka = 0, total8 = 0, total10 = 0;
    const mei = o.lines.map((l, i) => {
      const mm = lineMoney({ tanka: l.tanka, suu: l.qty, mtax, taxrate: l.taxrate });
      const k = rs.gkbn.get(l.gcode) ?? '0';
      if (k == '1') {
        soryozn += mm.tout;
      } else if (k == '2') {
        tesuzn += mm.tout;
      } else if (k == '3') {
        nebikizn += mm.tout;
      } else {
        gtotalzn += mm.tout;
      }
      taxtotal += mm.tax;
      genka += Math.round(l.genka * l.qty);
      if (l.taxrate == 8) {
        total8 += mm.tin;
      } else {
        total10 += mm.tin;
      }
      return {
        id, denno, line: i + 1, scode: l.scode || OBI_DEFAULT_SCODE, gcode: l.gcode, gtext: nz(l.gtext), suu: l.qty, tanka: l.tanka, money: mm.money,
        toutmoney: mm.tout, tinmoney: mm.tin, taxmoney: mm.tax, taxrate: String(l.taxrate), mtax,
        genka: l.genka, tgenka: Math.round(l.genka * l.qty), mmemo: nz(l.memo), gskbn: st.gsk.get(l.gcode), del: false
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

    // 4. 受注伝票（顧客マスタの値。配送方法・納品書タイプ・媒体は直近の受注伝票に合わせる）
    const jyuden = {
      id, denno, day: today, mcode: m.mcode, scde: nz(m.scde) ?? m.mcode, ncode: m.mcode, nadr: 0, iadr: l0?.iadr ?? null,
      scode: mei[0].scode, tcode: nz(m.tcode), tcode1: nz(m.tcode1),
      daibunrui: nz(m.daibunrui), chubunrui: nz(m.chubunrui), shobunrui: nz(m.shobunrui),
      jcode: OBI_JCODE, pcode: nz(m.pcode), bcode: l0?.bcode ?? null, bkcode: l0?.bkcode ?? null,
      hcode: l0?.hcode ?? nz(m.hcode), buntype,
      skbn: SKBN_URIAGE, yday: this.defsrv.yday(), dmemo,
      gtotalzn, soryozn, tesuzn, nebikizn, taxtotal, total: gtotalzn + soryozn + tesuzn + nebikizn + taxtotal, total8, total10, genka,
      torikbn: !!m.torikbn, jdstatus: JDST.TOROKU, del: false,
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };

    const Insert = gql`
      mutation obi_insert(
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
