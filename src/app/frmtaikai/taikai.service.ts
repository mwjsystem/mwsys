import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { JyuStock, JyuStockService } from './../services/jyustock.service';
import { JyuDefaultService } from './../services/jyudefault.service';
import { JDST } from './../frmship/ship-forms';
import { lineMoney } from './../frmrakuten/rakuten-parse';
import { Taikai, TaikaiItem } from './taikai-parse';

/** 朝来倉庫 */
export const HOME_SCODE = '01';
/** 受注伝票の固定値（現行の make_csv.xlsm と同じ。受注方法 1：電話、入金方法 15：現金受取、配送方法 07：元シ佐、明細は内税） */
const TK_JCODE = '1';
const TK_PCODE = '15';
const TK_HCODE = '07';
const TK_MTAX = '1';
const TK_BUNTYPE = 1;
const KEY_JDENNO = 'jdenno';
const KEY_MDENNO = 'mdenno';

interface MemberRow {
  mcode: string; sei: string | null; del: boolean | null; tcode: string | null; tcode1: string | null;
  daibunrui: string | null; chubunrui: string | null; shobunrui: string | null; scde: string | null;
}
interface MadrRow { eda: number; zip: string | null; street: string | null; adrname: string | null }
interface GoodsRow { gcode: string; gtext: string | null; msggroup: { gkbn: string | null } | null; msgtankas: { genka: number | null; taxrate: string | null }[] }

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t == '' ? null : t;
};
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').replace(/[\s　-]/g, '') == (b ?? '').replace(/[\s　-]/g, '');

/** 移動伝票の在庫（入庫先へ movi、出庫元へ movo。セット品は在庫対象の構成品） */
function moveZaiko(st: JyuStock, id: number, day: string, incode: string, outcode: string, lines: { gcode: string; suu: number }[]) {
  const qty = new Map<string, number>();
  const add = (g: string, n: number) => qty.set(g, (qty.get(g) ?? 0) + n);
  for (const l of lines) {
    const kbn = st.gsk.get(l.gcode);
    if (kbn == '0') {
      add(l.gcode, l.suu);
    } else if (kbn == '1') {
      for (const c of st.gz.get(l.gcode) ?? []) {
        if (st.zgsk.get(c.zcode) == '0') {
          add(c.zcode, Math.round(l.suu * c.irisu));
        }
      }
    }
  }
  const zinit: object[] = [];
  const zinc: object[] = [];
  const where = (scode: string, gcode: string) => ({ id: { _eq: id }, scode: { _eq: scode }, gcode: { _eq: gcode }, day: { _eq: day } });
  qty.forEach((n, gcode) => {
    zinit.push({ id, scode: incode, gcode, day }, { id, scode: outcode, gcode, day });
    zinc.push({ where: where(incode, gcode), _inc: { movi: n } }, { where: where(outcode, gcode), _inc: { movo: n } });
  });
  return { zinit, zinc };
}

/**
 * 大会リストの登録（現行の make_csv.xlsm の置き換え）。
 *  - 出荷: 移動伝票（01 朝来倉庫 → 大会倉庫 5xx。準備数）
 *  - 売上: 受注伝票（大会倉庫から出荷済。売上数・販売価格・内税）と、戻りの移動伝票（大会倉庫 → 01。在庫数）を 1 トランザクションで
 */
@Injectable({
  providedIn: 'root'
})
export class TaikaiService {
  private usrsrv = inject(UserService);
  private stksrv = inject(JyuStockService);
  private defsrv = inject(JyuDefaultService);
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

  private async next(key: string): Promise<number> {
    const n = await this.usrsrv.getNumber(key, 1);
    if (!n) {
      throw new Error('採番できませんでした：' + key);
    }
    return n;
  }

  /** 大会倉庫（倉庫コードが 5 で始まる倉庫と、名前に「大会」がある倉庫。削除フラグが空の倉庫も含める） */
  async stores(): Promise<{ code: string; name: string }[]> {
    const Get = gql`
      query get_taikai_store($id: smallint!) {
        msstore(where: {id: {_eq: $id}, _and: [
          {_or: [{code: {_like: "5%"}}, {name: {_like: "%大会%"}}, {subname: {_like: "%大会%"}}]},
          {_or: [{del: {_is_null: true}}, {del: {_eq: false}}]}
        ]}, order_by: {code: asc}) { code subname }
      }`;
    const q = await this.query<{ msstore: { code: string; subname: string | null }[] }>(Get, { id: this.usrsrv.compid });
    return q.msstore.map(e => ({ code: e.code, name: e.subname ?? '' }));
  }

  /** 伝票備考（大会名。二重登録の確認にも使う） */
  memo(t: Taikai, kind: '出荷' | '売上' | '戻り'): string {
    return ('大会' + kind + ' ' + t.name).slice(0, 100);
  }

  /** 商品・受注先・登録済みを DB で確認する。受注先の名前を返す */
  async resolve(t: Taikai): Promise<{ mname: string; ship: number | null; sale: number | null }> {
    const Get = gql`
      query get_taikai_check($id: smallint!, $gcodes: [String!]!, $mcode: String!, $mship: String!, $msale: String!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) { gcode gtext }
        msmember_by_pk(id: $id, mcode: $mcode) { sei del }
        ship: trmovsub(where: {id: {_eq: $id}, dmemo: {_eq: $mship}}, order_by: {denno: desc}, limit: 1) { denno }
        sale: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, dmemo: {_eq: $msale}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
      }`;
    const q = await this.query<{ msgoods: { gcode: string; gtext: string | null }[]; msmember_by_pk: { sei: string | null; del: boolean | null } | null;
      ship: { denno: number }[]; sale: { denno: number }[] }>(Get, {
      id: this.usrsrv.compid, gcodes: [...new Set(t.items.map(i => i.gcode))], mcode: t.mcode || '-',
      mship: this.memo(t, '出荷'), msale: this.memo(t, '売上')
    });
    const goods = new Map(q.msgoods.map(g => [g.gcode, g]));
    t.items.forEach(i => {
      const g = goods.get(i.gcode);
      i.found = !!g;
      i.gtext = g?.gtext ?? '';
    });
    const m = q.msmember_by_pk;
    return { mname: m && !m.del ? (m.sei ?? '') : '', ship: q.ship[0]?.denno ?? null, sale: q.sale[0]?.denno ?? null };
  }

  /** 移動伝票（ヘッダ・明細）の登録データ */
  private movden(denno: number, day: string, incode: string, outcode: string, t: Taikai, kind: '出荷' | '戻り', lines: TaikaiItem[], suu: (i: TaikaiItem) => number) {
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();
    const sub = {
      id, denno, day, incode, outcode, tcode: by, hcode: kind == '出荷' ? TK_HCODE : null, hday: kind == '出荷' ? t.arriveDay : null,
      htime: null, dmemo: this.memo(t, kind),
      omemo: nz(kind == '出荷' ? [t.venue, t.atena, t.okuriMemo].filter(e => e).join(' ') : null),
      smemo: nz(kind == '出荷' ? ['営業担当:' + t.tantoName, '出荷日:' + (t.shipDay ?? ''), t.arriveTime ? '到着:' + t.arriveTime : ''].filter(e => e).join(' ') : null),
      created_at: now, created_by: by, updated_at: now, updated_by: by
    };
    const mei = lines.map((i, k) => ({ id, denno, line: k + 1, gcode: i.gcode, suu: suu(i), memo: nz(i.memo) }));
    return { sub, mei };
  }

  /** 出荷：移動伝票（01 → 大会倉庫。準備数）。伝票番号を返す */
  async ship(t: Taikai, scode: string): Promise<number> {
    const day = t.shipDay;
    if (!day) {
      throw new Error('出荷日がありません');
    }
    const lines = t.items.filter(i => i.prep > 0);
    const st = await this.stksrv.check([...new Set(lines.map(i => i.gcode))]);
    const denno = await this.next(KEY_MDENNO);
    const { sub, mei } = this.movden(denno, day, scode, HOME_SCODE, t, '出荷', lines, i => i.prep);
    const { zinit, zinc } = moveZaiko(st, this.usrsrv.compid, day, scode, HOME_SCODE, mei);
    const Insert = gql`
      mutation taikai_ship($sub: trmovsub_insert_input!, $mei: [trmovden_insert_input!]!, $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        insert_trmovsub_one(object: $sub) { denno }
        insert_trmovden(objects: $mei) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    await this.mutate(Insert, { sub, mei, zinit, zinc });
    return denno;
  }

  /**
   * 売上：受注伝票（大会倉庫から出荷済。売上数・販売価格・内税）と戻りの移動伝票（大会倉庫 → 01。在庫数）。
   * day は受注日・売上日・出荷日・戻りの日付。伝票番号（受注・移動。戻りが無ければ null）を返す
   */
  async sale(t: Taikai, scode: string, day: string): Promise<{ jdenno: number | null; mdenno: number | null }> {
    const id = this.usrsrv.compid;
    const by = this.usrsrv.staff.code;
    const now = new Date();
    const sold = t.items.filter(i => i.sales > 0);
    const back = t.items.filter(i => i.stock > 0);
    if (sold.length == 0 && back.length == 0) {
      throw new Error('売上数・在庫数がありません');
    }

    // 受注先と納品先（別納品の枝番が無ければ、送先の住所を探し、無ければ追加）
    const GetM = gql`
      query get_taikai_member($id: smallint!, $mcode: String!) {
        msmember_by_pk(id: $id, mcode: $mcode) { mcode sei del tcode tcode1 daibunrui chubunrui shobunrui scde }
        msmadr(where: {id: {_eq: $id}, mcode: {_eq: $mcode}}, order_by: {eda: asc}) { eda zip street adrname }
        last: trjyuden(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {denno: desc}, limit: 1) { buntype }
      }`;
    const qm = await this.query<{ msmember_by_pk: MemberRow | null; msmadr: MadrRow[]; last: { buntype: string | null }[] }>(GetM, { id, mcode: t.mcode });
    const m = qm.msmember_by_pk;
    if (sold.length > 0 && (!m || m.del)) {
      throw new Error('受注先 ' + t.mcode + ' が顧客マスタにありません');
    }

    const st = await this.stksrv.check([...new Set(t.items.filter(i => i.sales > 0 || i.stock > 0).map(i => i.gcode))]);
    const variables: Record<string, object | object[]> = {
      madr: [], jyuden: {}, jyumei: [], jyumzai: [], msub: [], mmei: [], zinit: [], zinc: []
    };
    const zinit: object[] = [];
    const zinc: object[] = [];
    let jdenno: number | null = null;
    let mdenno: number | null = null;

    if (sold.length > 0 && m) {
      let nadr = 0;
      const madr: object[] = [];
      if (t.eda != null) {
        nadr = t.eda;
      } else if (t.addr) {
        const hit = qm.msmadr.find(e => Number(e.eda) >= 2 && same(e.zip, t.zip) && same(e.street, t.addr) && same(e.adrname, t.atena || t.venue));
        if (hit) {
          nadr = Number(hit.eda);
        } else {
          nadr = Math.max(1, ...qm.msmadr.map(e => Number(e.eda))) + 1;
          madr.push({ id, mcode: m.mcode, eda: nadr, zip: nz(t.zip), street: nz(t.addr), extend2: nz(t.venue), tel: nz(t.tel), adrname: nz(t.atena || t.venue), del: false });
        }
      }
      // 商品の区分・原価・税率
      const GetG = gql`
        query get_taikai_goods($id: smallint!, $gcodes: [String!]!, $day: date!) {
          msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) {
            gcode gtext
            msggroup { gkbn }
            msgtankas(limit: 1, where: {day: {_lte: $day}}, order_by: {day: desc_nulls_last}) { genka taxrate }
          }
        }`;
      const qg = await this.query<{ msgoods: GoodsRow[] }>(GetG, { id, gcodes: [...new Set(sold.map(i => i.gcode))], day });
      const goods = new Map(qg.msgoods.map(g => [g.gcode, g]));
      const buntype = qm.last[0]?.buntype ?? await this.defsrv.buntype(TK_BUNTYPE);
      jdenno = await this.next(KEY_JDENNO);
      let gtotalzn = 0, soryozn = 0, tesuzn = 0, nebikizn = 0, taxtotal = 0, genka = 0, total8 = 0, total10 = 0;
      const jyumei = sold.map((i, k) => {
        const g = goods.get(i.gcode);
        const t0 = g?.msgtankas[0];
        const taxrate = Number(t0?.taxrate ?? 10) || 10;
        const gk = (g?.msggroup?.gkbn ?? '0').trim() || '0';
        const mm = lineMoney({ tanka: i.price, suu: i.sales, mtax: TK_MTAX, taxrate });
        const gen = Number(t0?.genka ?? 0);
        if (gk == '1') {
          soryozn += mm.tout;
        } else if (gk == '2') {
          tesuzn += mm.tout;
        } else if (gk == '3') {
          nebikizn += mm.tout;
        } else {
          gtotalzn += mm.tout;
        }
        taxtotal += mm.tax;
        genka += Math.round(gen * i.sales);
        if (taxrate == 8) {
          total8 += mm.tin;
        } else {
          total10 += mm.tin;
        }
        return {
          id, denno: jdenno, line: k + 1, scode, sday: day, gcode: i.gcode, gtext: nz(g?.gtext ?? i.name), suu: i.sales, tanka: i.price, money: mm.money,
          toutmoney: mm.tout, tinmoney: mm.tin, taxmoney: mm.tax, taxrate: String(taxrate), mtax: TK_MTAX,
          genka: gen, tgenka: Math.round(gen * i.sales), mmemo: nz(i.memo), gskbn: st.gsk.get(i.gcode), del: false
        };
      });
      // 明細在庫と、大会倉庫からの出荷（受注伝票画面で出荷日を入れたときと同じく syuk に加算）
      const r = this.stksrv.rows(st, jdenno, scode, day, jyumei);
      const syuk = new Map<string, number>();
      (r.mzai as { gcode: string; suu: number }[]).forEach(z => syuk.set(z.gcode, (syuk.get(z.gcode) ?? 0) + z.suu));
      syuk.forEach((n, gcode) => {
        zinit.push({ id, scode, gcode, day });
        zinc.push({ where: { id: { _eq: id }, scode: { _eq: scode }, gcode: { _eq: gcode }, day: { _eq: day } }, _inc: { syuk: n } });
      });
      variables['madr'] = madr;
      variables['jyumei'] = jyumei;
      variables['jyumzai'] = r.mzai;
      variables['jyuden'] = {
        id, denno: jdenno, day, uday: day, sday: day, yday: day, mcode: m.mcode, scde: nz(m.scde) ?? m.mcode, ncode: m.mcode, nadr, scode,
        tcode: nz(m.tcode), tcode1: nz(t.tcode1) ?? nz(m.tcode1), daibunrui: nz(t.daibunrui) ?? nz(m.daibunrui),
        chubunrui: nz(m.chubunrui), shobunrui: nz(m.shobunrui),
        jcode: TK_JCODE, pcode: TK_PCODE, hcode: TK_HCODE, buntype, skbn: '0', torikbn: false,
        dmemo: this.memo(t, '売上'), omemo: nz(['配達前要連絡', t.okuriMemo].filter(e => e).join(' ')),
        gtotalzn, soryozn, tesuzn, nebikizn, taxtotal, total: gtotalzn + soryozn + tesuzn + nebikizn + taxtotal, total8, total10, genka,
        jdstatus: JDST.KANRYO, del: false, created_at: now, created_by: by, updated_at: now, updated_by: by
      };
    }

    if (back.length > 0) {
      mdenno = await this.next(KEY_MDENNO);
      const { sub, mei } = this.movden(mdenno, day, HOME_SCODE, scode, t, '戻り', back, i => i.stock);
      const z = moveZaiko(st, id, day, HOME_SCODE, scode, mei);
      zinit.push(...z.zinit);
      zinc.push(...z.zinc);
      variables['msub'] = [sub];
      variables['mmei'] = mei;
    }
    variables['zinit'] = zinit;
    variables['zinc'] = zinc;

    const Insert = jdenno != null ? gql`
      mutation taikai_sale(
        $madr: [msmadr_insert_input!]!, $jyuden: trjyuden_insert_input!, $jyumei: [trjyumei_insert_input!]!, $jyumzai: [trjyumzai_insert_input!]!,
        $msub: [trmovsub_insert_input!]!, $mmei: [trmovden_insert_input!]!, $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!
      ) {
        insert_msmadr(objects: $madr) { affected_rows }
        insert_trjyuden_one(object: $jyuden) { denno }
        insert_trjyumei(objects: $jyumei) { affected_rows }
        insert_trjyumzai(objects: $jyumzai) { affected_rows }
        insert_trmovsub(objects: $msub) { affected_rows }
        insert_trmovden(objects: $mmei) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }` : gql`
      mutation taikai_back(
        $msub: [trmovsub_insert_input!]!, $mmei: [trmovden_insert_input!]!, $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!
      ) {
        insert_trmovsub(objects: $msub) { affected_rows }
        insert_trmovden(objects: $mmei) { affected_rows }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    if (jdenno == null) {
      delete variables['madr'];
      delete variables['jyuden'];
      delete variables['jyumei'];
      delete variables['jyumzai'];
    }
    await this.mutate(Insert, variables);
    return { jdenno, mdenno };
  }
}
