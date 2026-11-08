import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JyuStockService } from './../services/jyustock.service';
import { JyuDefaultService, SKBN_URIAGE } from './../services/jyudefault.service';
import { JDST } from './../frmship/ship-forms';
import { RakutenOrder, lineMoney, taxIn } from './rakuten-parse';

/** 受注方法（9：WEB）・媒体（01）・媒体管理（02：楽天） */
const RKT_JCODE = '9';
const RKT_BCODE = '01';
const RKT_BKCODE = '02';
/** 伝票・顧客のフリーコード（通販Pro の 200001・203・3117 = 大分類・中分類・営業担当） */
const RKT_DAIBUNRUI = '200001';
const RKT_CHUBUNRUI = '203';
const RKT_TCODE1 = '3117';
/** 納品書タイプ（1：納品書のみ） */
const RKT_BUNTYPE = 1;
/** 配送方法の名前（送り状マスタ。元払い・代引） */
const HNAME_MOTO = '楽天SS元';
const HNAME_DAI = '楽天SS代';
const KEY_DENNO = 'jdenno';
const KEY_MCODE = 'mcode';

interface MadrRow { mcode: string; eda: number; zip: string | null; street: string | null; adrname: string | null; tel: string | null }
interface GoodsRow { gcode: string; gtext: string | null; msggroup: { gkbn: string | null } | null; msgtankas: { genka: number | null; taxrate: string | null }[] }

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t == '' ? null : t;
};
const digits = (s: string | null | undefined): string => (s ?? '').replace(/[^0-9]/g, '');
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').replace(/[\s　]/g, '') == (b ?? '').replace(/[\s　]/g, '');

/**
 * 楽天受注の取込（現行の通販Pro の取込設定 175 の置き換え）。1 注文ごとに 1 トランザクションで登録する。
 * 注文者は電話番号で顧客マスタ（住所の電話番号）を探し、無ければ新規作成する。送付先が注文者と違えば納品先の住所にする
 */
@Injectable({
  providedIn: 'root'
})
export class RakutenService {
  private usrsrv = inject(UserService);
  private stksrv = inject(JyuStockService);
  private defsrv = inject(JyuDefaultService);
  private apollo = inject(Apollo);

  private hcode = { moto: '', dai: '' };

  private async query<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    return res.data as T;
  }

  /** 電話番号で顧客を探す（削除済を除く。自宅住所〈枝番 0〉の一致を優先し、同じなら顧客コードの小さい方） */
  private async findByTel(tels: string[]): Promise<Map<string, string>> {
    const ret = new Map<string, string>();
    const keys = [...new Set(tels.map(digits).filter(e => e.length >= 9))];
    if (keys.length == 0) {
      return ret;
    }
    // 電話番号はハイフンありとなしの両方で探す
    const forms = keys.flatMap(k => [k, ...tels.filter(t => digits(t) == k)]);
    const Get = gql`
      query get_rkt_tel($id: smallint!, $tels: [String!]!) {
        msmadr(where: {id: {_eq: $id}, tel: {_in: $tels}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: [{eda: asc}, {mcode: asc}]) { mcode eda tel }
      }`;
    const q = await this.query<{ msmadr: { mcode: string; eda: number; tel: string }[] }>(Get, { id: this.usrsrv.compid, tels: [...new Set(forms)] });
    const mcodes = [...new Set(q.msmadr.map(e => e.mcode))];
    if (mcodes.length == 0) {
      return ret;
    }
    const GetM = gql`
      query get_rkt_member($id: smallint!, $mcodes: [String!]!) {
        msmember(where: {id: {_eq: $id}, mcode: {_in: $mcodes}, del: {_eq: false}}) { mcode }
      }`;
    const live = new Set((await this.query<{ msmember: { mcode: string }[] }>(GetM, { id: this.usrsrv.compid, mcodes })).msmember.map(e => e.mcode));
    const rows = q.msmadr.filter(e => live.has(e.mcode))
      .sort((a, b) => (Number(a.eda) == 0 ? 0 : 1) - (Number(b.eda) == 0 ? 0 : 1) || a.mcode.localeCompare(b.mcode));
    for (const r of rows) {
      const k = digits(r.tel);
      if (!ret.has(k)) {
        ret.set(k, r.mcode);
      }
    }
    return ret;
  }

  /** 配送方法・商品・顧客・登録済みを DB で解決する */
  async resolve(orders: RakutenOrder[]): Promise<void> {
    const Get = gql`
      query get_rkt_master($id: smallint!, $gcodes: [String!]!, $cusdens: [String!]!, $bcode: String!) {
        mshokuri(where: {id: {_eq: $id}}) { code name }
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
          gcode gtext
          msggroup { gkbn }
          msgtankas(limit: 1, order_by: {day: desc}) { genka taxrate }
        }
        trjyuden(where: {id: {_eq: $id}, cusden: {_in: $cusdens}, bcode: {_eq: $bcode}, _not: {del: {_eq: true}}}) { cusden denno }
      }`;
    const gcodes = [...new Set(orders.flatMap(o => o.lines.map(l => l.gcode)))];
    const q = await this.query<{ mshokuri: { code: string; name: string }[]; msgoods: GoodsRow[]; trjyuden: { cusden: string; denno: number }[] }>(
      Get, { id: this.usrsrv.compid, gcodes, cusdens: orders.map(o => o.cusden), bcode: RKT_BCODE });
    const hk = (name: string) => q.mshokuri.find(e => (e.name ?? '').replace(/[\s　]/g, '').includes(name))?.code ?? '';
    this.hcode = { moto: hk(HNAME_MOTO), dai: hk(HNAME_DAI) };
    if (!this.hcode.moto || !this.hcode.dai) {
      throw new Error('送り状マスタに「' + HNAME_MOTO + '」「' + HNAME_DAI + '」がありません');
    }
    const goods = new Map(q.msgoods.map(g => [g.gcode, g]));
    const tels = await this.findByTel(orders.map(o => o.tel));
    for (const o of orders) {
      const done = q.trjyuden.find(e => e.cusden == o.cusden);
      if (done) {
        o.result = '登録済（伝票番号 ' + done.denno + '）';
        o.denno = done.denno;
      }
      const hit = tels.get(digits(o.tel));
      o.mcode = hit ?? '';
      o.found = !!hit;
      const missing = new Set<string>();
      for (const l of o.lines) {
        const g = goods.get(l.gcode);
        if (!g) {
          missing.add(l.gcode);
          continue;
        }
        const t = g.msgtankas[0];
        l.gtext = g.gtext ?? l.name;
        l.gkbn = (g.msggroup?.gkbn ?? '0').trim() || '0';
        l.genka = Number(t?.genka ?? 0);
        l.taxrate = Number(t?.taxrate ?? 10) || 10;
      }
      if (missing.size > 0) {
        o.err = [o.err, '商品マスタに無い商品コード：' + [...missing].join('、')].filter(e => e).join('／');
      }
    }
  }

  /** 1 件（1 注文）を登録する。tanto は画面で選んだ担当者。結果の文字列を返す */
  async register(o: RakutenOrder, tanto: string | null): Promise<string> {
    if (o.err || !o.day) {
      throw new Error(o.err || '受注日が不正です');
    }
    if (o.lines.length == 0) {
      throw new Error('明細がありません');
    }
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();

    // 1. 既存伝票（注文番号と媒体）。あればスキップ
    const Check = gql`
      query get_rkt_check($id: smallint!, $cusden: String!, $bcode: String!) {
        trjyuden(where: {id: {_eq: $id}, cusden: {_eq: $cusden}, bcode: {_eq: $bcode}, _not: {del: {_eq: true}}}, limit: 1) { denno }
      }`;
    const chk = await this.query<{ trjyuden: { denno: number }[] }>(Check, { id, cusden: o.cusden, bcode: RKT_BCODE });
    if (chk.trjyuden.length > 0) {
      o.denno = chk.trjyuden[0].denno;
      return 'スキップ（既存 伝票番号 ' + o.denno + '）';
    }

    // 2. 商品マスタで在庫対象を判定（採番より前にチェック）
    const st = await this.stksrv.check([...new Set(o.lines.map(l => l.gcode))]);

    // 3. 顧客（画面で直した顧客コード → 無ければ新規）
    let mcode = (o.mcode ?? '').trim();
    let madrs: MadrRow[] = [];
    if (mcode) {
      const Get = gql`
        query get_rkt_madr($id: smallint!, $mcode: String!) {
          msmember_by_pk(id: $id, mcode: $mcode) { mcode del }
          msmadr(where: {id: {_eq: $id}, mcode: {_eq: $mcode}}, order_by: {eda: asc}) { mcode eda zip street adrname tel }
        }`;
      const q = await this.query<{ msmember_by_pk: { mcode: string; del: boolean | null } | null; msmadr: MadrRow[] }>(Get, { id, mcode });
      if (!q.msmember_by_pk || q.msmember_by_pk.del) {
        throw new Error('顧客コード ' + mcode + ' が顧客マスタにありません');
      }
      madrs = q.msmadr;
    }
    const isNew = !mcode;
    if (isNew) {
      mcode = String(await this.getNext(KEY_MCODE));
    }
    const members: object[] = [];
    const newMadr: object[] = [];
    if (isNew) {
      members.push({
        id, mcode, sei: o.sei || '(氏名なし)', kana: nz(o.kana), tcode: nz(tanto), tcode1: RKT_TCODE1,
        daibunrui: RKT_DAIBUNRUI, chubunrui: RKT_CHUBUNRUI, torikbn: false,
        created_at: now, created_by: by, updated_at: now, updated_by: by
      });
      const a = { id, mcode, eda: 0, zip: nz(o.zip), region: nz(o.pref), local: nz(o.city), street: nz(o.addr), tel: nz(o.tel), adrname: nz(o.sei), del: false };
      newMadr.push(a);
      madrs.push({ mcode, eda: 0, zip: a.zip, street: a.street, adrname: a.adrname, tel: a.tel });
    }

    // 4. 納品先（送付先が注文者と同じなら自宅。違えば同じ住所を探し、無ければ住所を追加）
    let nadr = 0;
    const sameAsOrderer = same(o.nzip, o.zip) && same(o.npref + o.ncity + o.naddr, o.pref + o.city + o.addr) && same(o.nsei, o.sei);
    if (!sameAsOrderer) {
      const hit = madrs.find(e => same(e.zip, o.nzip) && same(e.adrname, o.nsei) &&
        (same(e.street, o.naddr) || same(e.street, o.ncity + o.naddr)));
      if (hit) {
        nadr = Number(hit.eda);
      } else {
        nadr = Math.max(1, ...madrs.map(e => Number(e.eda))) + 1; // eda 0:本人 1:請求先 のため 2 から採番
        newMadr.push({ id, mcode, eda: nadr, zip: nz(o.nzip), region: nz(o.npref), local: nz(o.ncity), street: nz(o.naddr), tel: nz(o.ntel), adrname: nz(o.nsei), del: false });
      }
    }

    // 5. 伝票番号
    const denno = await this.getNext(KEY_DENNO);

    // 6. 明細・明細在庫・在庫（倉庫は明細ごと）
    let gtotalzn = 0, soryozn = 0, tesuzn = 0, nebikizn = 0, taxtotal = 0, genka = 0, total8 = 0, total10 = 0;
    const mei = o.lines.map((l, i) => {
      const m = lineMoney(l);
      if (l.gkbn == '1') {
        soryozn += m.tout;
      } else if (l.gkbn == '2') {
        tesuzn += m.tout;
      } else if (l.gkbn == '3') {
        nebikizn += m.tout;
      } else {
        gtotalzn += m.tout;
      }
      taxtotal += m.tax;
      genka += Math.round(l.genka * l.suu);
      if (l.taxrate == 8) {
        total8 += m.tin;
      } else {
        total10 += m.tin;
      }
      return {
        id, denno, line: i + 1, scode: l.scode, gcode: l.gcode, gtext: nz(l.gtext), suu: l.suu, tanka: l.tanka, money: m.money,
        toutmoney: m.tout, tinmoney: m.tin, taxmoney: m.tax, taxrate: String(l.taxrate), mtax: l.mtax,
        genka: l.genka, tgenka: Math.round(l.genka * l.suu), gskbn: st.gsk.get(l.gcode), del: false
      };
    });
    const mzai: object[] = [];
    const zinit: object[] = [];
    const zinc: object[] = [];
    for (const sc of [...new Set(mei.map(m => m.scode))]) {
      const r = this.stksrv.rows(st, denno, sc, o.day, mei.filter(m => m.scode == sc));
      mzai.push(...r.mzai);
      zinit.push(...r.zinit);
      zinc.push(...r.zinc);
    }

    // 7. 受注伝票
    const total = gtotalzn + soryozn + tesuzn + nebikizn + taxtotal;
    const buntype = await this.defsrv.buntype(RKT_BUNTYPE);
    const nmemo = [[o.day.replace(/-/g, '/'), o.time].filter(e => e).join(' '), o.okihai].filter(e => e).join(' ');
    const jyuden = {
      id, denno, day: o.day, mcode, scde: mcode, ncode: mcode, nadr, scode: mei[0].scode,
      tcode: nz(tanto), tcode1: RKT_TCODE1, daibunrui: RKT_DAIBUNRUI, chubunrui: RKT_CHUBUNRUI,
      jcode: RKT_JCODE, pcode: o.pcode, bcode: RKT_BCODE, bkcode: RKT_BKCODE,
      hcode: o.daibiki ? this.hcode.dai : this.hcode.moto,
      skbn: SKBN_URIAGE, yday: this.defsrv.yday(), buntype,
      nmemo: nz(nmemo), omemo: nz(o.okihai), cusden: o.cusden,
      gtotalzn, soryozn, tesuzn, nebikizn, taxtotal, total, total8, total10, genka,
      daibiki: o.daibiki ? total : 0, daibzei: o.daibiki ? taxIn(total, 10) : 0,
      torikbn: false, jdstatus: JDST.TOROKU, del: false,
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };

    // 8. 登録（顧客・住所・伝票・明細・明細在庫・在庫を 1 トランザクションで）
    const Insert = gql`
      mutation rkt_insert(
        $member: [msmember_insert_input!]!, $madr: [msmadr_insert_input!]!,
        $jyuden: trjyuden_insert_input!, $jyumei: [trjyumei_insert_input!]!, $jyumzai: [trjyumzai_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!
      ) {
        insert_msmember(objects: $member) { affected_rows }
        insert_msmadr(objects: $madr) { affected_rows }
        insert_trjyuden_one(object: $jyuden) { denno }
        insert_trjyumei(objects: $jyumei) { affected_rows }
        insert_trjyumzai(objects: $jyumzai) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({
      mutation: Insert, variables: { member: members, madr: newMadr, jyuden, jyumei: mei, jyumzai: mzai, zinit, zinc }
    }));
    if (res.error) {
      throw new Error(res.error.message);
    }
    o.mcode = mcode;
    o.denno = denno;
    return '登録済' + (isNew ? '（顧客新規 ' + mcode + '）' : '') + (nadr > 0 ? '（納品先 住所 ' + nadr + '）' : '');
  }

  private async getNext(key: string): Promise<number> {
    const n = await this.usrsrv.getNumber(key, 1);
    if (!n) {
      throw new Error('採番できませんでした：' + key);
    }
    return n;
  }
}
