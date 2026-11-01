import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JDST } from './../frmship/ship-forms';
import { OcnkConf, OcnkDojo, OcnkHaiso, OcnkOrder, exTax, isDaibiki, taxOf } from './ocnk-parse';

/** 変換表一式 */
export type OcnkMaster = Pick<OcnkConf, 'haiso' | 'pay' | 'time'>;

/** 倉庫（受注伝票・明細・在庫の scode） */
const WEB_SCODE = '01';
/** 受注方法（9：WEB） */
const WEB_JCODE = '9';
/** 採番キー */
const KEY_DENNO = 'jdenno';
const KEY_MCODE = 'mcode';

interface MadrInput { id: number; mcode: string; eda: number; zip: string | null; region: string | null; street: string | null; extend: string | null; extend2: string | null; tel: string | null; adrname: string | null; del: boolean }
interface MadrRow { eda: number; zip: string | null; street: string | null; adrname: string | null }
interface MemberRow { mcode: string; daibunrui: string | null; chubunrui: string | null; tcode1: string | null }

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t == '' ? null : t;
};
const nzs = (s: string | null | undefined): string => (s ?? '').trim();

/** おちゃのこ受注の取込（現行 BTC-MWWEB.xlsm の機能２。1 件ごとに 1 トランザクションで登録する） */
@Injectable({
  providedIn: 'root'
})
export class OcnkService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  private async query<T>(query: ReturnType<typeof gql>, variables: object): Promise<T> {
    const res = await firstValueFrom(this.apollo.query<T>({ query, variables, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'データを取得できませんでした');
    }
    return res.data as T;
  }

  private async mutate(mutation: ReturnType<typeof gql>, variables: object): Promise<void> {
    const res = await firstValueFrom(this.apollo.mutate({ mutation, variables }));
    if (res.error) {
      throw new Error(res.error.message);
    }
  }

  async master(): Promise<OcnkMaster> {
    const Get = gql`
      query get_ocnk_master($id: smallint!) {
        mswebhaiso(where: {id: {_eq: $id}}) { hname daibunrui bumon tanto mtax bkcode hcode hcoded }
        mswebpay(where: {id: {_eq: $id}}) { pname pcode }
        mswebtime(where: {id: {_eq: $id}}) { tname code }
      }`;
    const q = await this.query<{
      mswebhaiso: OcnkHaiso[]; mswebpay: { pname: string; pcode: string }[];
      mswebtime: { tname: string; code: string }[];
    }>(Get, { id: this.usrsrv.compid });
    const pay: Record<string, string> = {};
    q.mswebpay.forEach(e => pay[e.pname] = e.pcode);
    const time: Record<string, string> = {};
    q.mswebtime.forEach(e => time[e.tname] = e.code);
    return { haiso: q.mswebhaiso, pay, time };
  }

  /**
   * 会員ID → 顧客（顧客マスタの webid で探す）。
   * 1 人で会員IDを複数持つ顧客は webid にカンマ区切りで入っているので、カンマを含む行も読んで分解する
   */
  async dojo(webids: string[]): Promise<Record<string, OcnkDojo>> {
    const Get = gql`
      query get_ocnk_dojo($id: smallint!, $webids: [String!]!) {
        msmember(where: {id: {_eq: $id}, del: {_eq: false}, _or: [{webid: {_in: $webids}}, {webid: {_like: "%,%"}}]}, order_by: {mcode: asc}) {
          mcode webid tcode tcode1 torikbn
        }
      }`;
    const q = await this.query<{ msmember: { mcode: string; webid: string; tcode: string | null; tcode1: string | null; torikbn: boolean | null }[] }>(
      Get, { id: this.usrsrv.compid, webids });
    const res: Record<string, OcnkDojo> = {};
    q.msmember.forEach(e => e.webid.split(',').map(s => s.trim()).filter(s => s).forEach(webid => {
      res[webid] ??= { webid, mcode: e.mcode, tcode: e.tcode, kake: !!e.torikbn, etanto: e.tcode1 };
    }));
    return res;
  }

  /** 商品の在庫区分（gskbn）とセット品の構成 */
  private async goods(codes: string[], gsk: Map<string, string>, gz: Map<string, { zcode: string; irisu: number }[]>) {
    const Get = gql`
      query get_ocnk_goods($id: smallint!, $gcodes: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) { gcode gskbn }
        msgzai(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}, order_by: [{gcode: asc}, {zcode: asc}]) { gcode zcode irisu }
      }`;
    const q = await this.query<{ msgoods: { gcode: string; gskbn: string | null }[]; msgzai: { gcode: string; zcode: string; irisu: number }[] }>(
      Get, { id: this.usrsrv.compid, gcodes: codes });
    q.msgoods.forEach(e => gsk.set(e.gcode, nzs(e.gskbn)));
    q.msgzai.forEach(e => {
      const list = gz.get(e.gcode) ?? [];
      list.push({ zcode: e.zcode, irisu: Number(e.irisu) });
      gz.set(e.gcode, list);
    });
  }

  private madr(mcode: string, zip: string, pref: string, addr: string, tel: string, adrname: string, extend2: string): MadrInput {
    const ln = addr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return {
      id: this.usrsrv.compid, mcode, eda: 0, zip: nz(zip), region: nz(pref), street: nz(ln[0]),
      extend: nz(ln.slice(1).join(' ')), extend2: nz(extend2), tel: nz(tel), adrname: nz(adrname), del: false
    };
  }

  /**
   * 受注 1 件を登録する（Register_Order）。結果の文字列を返す。
   * マクロとの違い: 受注ステータスを「登録」にする。営業担当・大分類・部門が空のときは顧客マスタの値を使う
   */
  async register(o: OcnkOrder): Promise<string> {
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();
    if (!o.day) {
      throw new Error('受注日が不正です');
    }
    if (o.lines.length == 0) {
      throw new Error('明細がありません');
    }

    // 1. 既存伝票チェック（あればスキップ）。媒体管理は発送方法で変わるので、注文番号と媒体で見る
    const Check = gql`
      query get_ocnk_check($id: smallint!, $cusden: String!, $bcode: String!) {
        trjyuden(where: {id: {_eq: $id}, cusden: {_eq: $cusden}, bcode: {_eq: $bcode}, _not: {del: {_eq: true}}}, limit: 1) { denno }
      }`;
    const chk = await this.query<{ trjyuden: { denno: number }[] }>(Check, { id, cusden: o.cusden, bcode: o.bcode });
    if (chk.trjyuden.length > 0) {
      return 'スキップ(既存 伝票番号 ' + chk.trjyuden[0].denno + ')';
    }

    // 2. 商品マスタで在庫対象を判定（採番より前にチェック）。0:在庫対象 2:在庫対象外 1:セット品（構成品で判定）
    const codes = [...new Set(o.lines.map(l => l.gcode))];
    const gsk = new Map<string, string>();
    const gz = new Map<string, { zcode: string; irisu: number }[]>();
    await this.goods(codes, gsk, gz);
    const missing = codes.filter(c => !gsk.has(c));
    if (missing.length > 0) {
      throw new Error('商品マスタに無い商品コード：' + missing.join(', '));
    }
    const zcodes = new Set<string>();
    gsk.forEach((v, k) => {
      if (v == '1') {
        const list = gz.get(k);
        if (!list) {
          throw new Error('セット品の構成(msgzai)がありません：' + k);
        }
        list.forEach(e => zcodes.add(e.zcode));
      } else if (v != '0' && v != '2') {
        throw new Error('商品 ' + k + ' の在庫区分(gskbn)が不正です：' + v);
      }
    });
    const zgsk = new Map<string, string>();
    if (zcodes.size > 0) {
      await this.goods([...zcodes], zgsk, new Map());
      const zmiss = [...zcodes].filter(c => !zgsk.has(c));
      if (zmiss.length > 0) {
        throw new Error('セット品の構成品が商品マスタにありません：' + zmiss.join(', '));
      }
      zgsk.forEach((v, k) => {
        if (v != '0' && v != '2') {
          throw new Error('構成品 ' + k + ' の在庫区分(gskbn)が不正です：' + v);
        }
      });
    }

    // 3. 会員（会員コード → メールアドレスの順に検索、無ければ新規作成）
    let mcode = nzs(o.mcode);
    const mail = nzs(o.mail);
    if (mcode == '' && mail != '') {
      const ByMail = gql`
        query get_ocnk_mail($id: smallint!, $mail: String!) {
          msmember(where: {id: {_eq: $id}, mail: {_eq: $mail}, del: {_eq: false}}, order_by: {mcode: asc}, limit: 1) { mcode }
        }`;
      const q = await this.query<{ msmember: { mcode: string }[] }>(ByMail, { id, mail });
      mcode = q.msmember[0]?.mcode ?? '';
    }
    let member: MemberRow | null = null;
    let madrs: MadrRow[] = [];
    if (mcode != '') {
      const Get = gql`
        query get_ocnk_member($id: smallint!, $mcode: String!) {
          msmember_by_pk(id: $id, mcode: $mcode) { mcode daibunrui chubunrui tcode1 }
          msmadr(where: {id: {_eq: $id}, mcode: {_eq: $mcode}}, order_by: {eda: asc}) { eda zip street adrname }
        }`;
      const q = await this.query<{ msmember_by_pk: MemberRow | null; msmadr: MadrRow[] }>(Get, { id, mcode });
      member = q.msmember_by_pk;
      madrs = [...q.msmadr];
    } else {
      mcode = String(await this.getNext(KEY_MCODE));
    }
    const isNew = member == null;

    const members: object[] = [];
    const newMadr: MadrInput[] = [];
    if (isNew) {
      const sei = nzs(o.sei) || '(氏名なし)';
      members.push({
        id, mcode, sei, kana: nz(o.kana), mail: nz(o.mail), webid: nz(o.webid), tcode: nz(o.tanto), daibunrui: nz(o.daibunrui), torikbn: o.kake,
        created_at: now, created_by: by, updated_at: now, updated_by: by
      });
      const a = this.madr(mcode, o.zip, o.pref, o.addr, o.tel, sei, (o.company + ' ' + o.busho).trim());
      newMadr.push(a);
      madrs.push(a);
    }

    // 4. 納入先（別納品は同じ住所があれば再利用、無ければ住所を追加）
    let nadr = 0;
    if (Number(o.nkbn) == 3) {
      const a = this.madr(mcode, o.nzip, o.npref, o.naddr, o.ntel, o.nname, o.ncompany);
      const same = madrs.find(e => nzs(e.zip) == nzs(a.zip) && nzs(e.street) == nzs(a.street) && nzs(e.adrname) == nzs(a.adrname));
      if (same) {
        nadr = Number(same.eda);
      } else {
        nadr = Math.max(1, ...madrs.map(e => Number(e.eda))) + 1; // eda 0:本人 1:請求先 のため 2 から採番
        a.eda = nadr;
        newMadr.push(a);
      }
    }

    // 5. 伝票番号採番
    const denno = await this.getNext(KEY_DENNO);

    // 6. 明細・明細在庫・在庫
    const zai = new Map<string, number>();
    const addQty = (g: string, n: number) => zai.set(g, (zai.get(g) ?? 0) + n);
    const mzai: object[] = [];
    const mei = o.lines.map((l, i) => {
      const line = i + 1;
      const suu = Math.round(l.suu);
      const kbn = gsk.get(l.gcode);
      if (kbn == '0') { // 在庫対象：商品自身
        mzai.push({ id, denno, line, eda: 1, gcode: l.gcode, suu });
        addQty(l.gcode, suu);
      } else if (kbn == '1') { // セット品：在庫対象の構成品のみ
        let eda = 0;
        for (const c of gz.get(l.gcode) ?? []) {
          if (zgsk.get(c.zcode) == '0') {
            const n = Math.round(suu * c.irisu);
            eda++;
            mzai.push({ id, denno, line, eda, gcode: c.zcode, suu: n });
            addQty(c.zcode, n);
          }
        }
      }
      return {
        id, denno, line, scode: WEB_SCODE, gcode: l.gcode, gtext: nz(l.gtext), suu, tanka: l.tanka, money: l.money,
        mtax: nz(l.mtax), mmemo: nz(l.memo), gskbn: kbn, del: false
      };
    });
    // 在庫：行が無ければ作成（何もしない）→ 受注数(jyut)を加算
    const zinit: object[] = [];
    const zinc: object[] = [];
    zai.forEach((qty, gcode) => {
      zinit.push({ id, scode: WEB_SCODE, gcode, day: o.day });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: WEB_SCODE }, gcode: { _eq: gcode }, day: { _eq: o.day } },
        _inc: { jyut: qty }
      });
    });

    // 7. 受注伝票。金額（おちゃのこは税込。消費税は 10/110 の端数切り上げ、税抜は 税込 - 消費税）
    const total = Math.round(o.total);
    const daibiki = isDaibiki(o.pay);
    const jyuden = {
      id, denno, day: o.day, hday: o.hday, htime: nz(o.htime), mcode, scde: mcode, ncode: mcode, nadr, scode: WEB_SCODE,
      tcode: nz(o.tanto), tcode1: nz(o.etanto) ?? nz(member?.tcode1),
      daibunrui: nz(o.daibunrui) ?? nz(member?.daibunrui), chubunrui: nz(o.bumon) ?? nz(member?.chubunrui),
      jcode: WEB_JCODE, pcode: nz(o.nyukin), bcode: o.bcode, bkcode: o.bkcode, hcode: nz(o.hcode),
      dmemo: nz(o.dmemo), nmemo: nz(o.nmemo), omemo: nz(o.omemo), cusden: o.cusden,
      total, total10: total, total8: 0, taxtotal: taxOf(total),
      gtotalzn: exTax(o.gtotal), soryozn: exTax(o.souryou), tesuzn: exTax(o.tesuu), nebikizn: exTax(o.nebiki),
      daibiki: daibiki ? total : 0, daibzei: daibiki ? taxOf(total) : 0,
      torikbn: o.kake, jdstatus: JDST.TOROKU, del: false,
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };

    // 8. 登録（会員・住所・伝票・明細・明細在庫・在庫を 1 トランザクションで）
    const Insert = gql`
      mutation ocnk_insert(
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
    await this.mutate(Insert, { member: members, madr: newMadr, jyuden, jyumei: mei, jyumzai: mzai, zinit, zinc });

    o.mcode = mcode;
    o.denno = denno;
    return '登録済' + (isNew ? '（会員新規 ' + mcode + '）' : '');
  }

  private async getNext(key: string): Promise<number> {
    const n = await this.usrsrv.getNumber(key, 1);
    if (!n) {
      throw new Error('採番できませんでした：' + key);
    }
    return n;
  }
}
