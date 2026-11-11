import { Injectable, inject } from '@angular/core';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { ZAIKO_ZERO } from './../services/jyustock.service';

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 仕入伝票。DB のトリガー（db/20261119_siire.sql）と同じ値 */
export const EXTYPE_SIIRE = '4';

/** 在庫（trzaiko）の入荷数（hnyu）の増減 1 件 */
export interface SiiZaiko { scode: string; gcode: string; day: string; hnyu: number }

/** 発注伝票のヘッダ（一括登録） */
export interface HatHead { denno: number; day: string; vcode: string; scode: string; tcode: string | null; currency: string | null }

/** 発注残のある発注明細（vhatzn。hatzn = 発注残） */
export interface OpenLine {
  denno: number; line: number; gcode: string; gtext: string | null; suu: number; hatzn: number; genka: number; money: number | null;
  taxrate: string | null; mtax: string | null; spec: string | null; mmemo: string | null; yday: string | null; ydaykbn: string | null;
  inday: string | null; jdenno: number | null; unit: string | null;
}
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 保存時に仕入明細（trsiimei）へ渡す値。inday は日付文字列（未入力は null） */
export type SiimeiInput = Pick<mwI.Siimei, 'line' | 'inday' | 'gcode' | 'suu' | 'genka' | 'money' | 'taxrate' | 'mmemo' | 'spec' | 'hdenno' | 'hline' | 'mtax'> & {
  id: number;
  denno: number;
};
/** 保存時に仕入伝票（trsiiden）の更新へ渡す値。inday は日付文字列 */
export type SiidenSet = Pick<mwI.Siiden, 'vcode' | 'scode' | 'tcode' | 'dmemo' | 'gtotal' | 'tax' | 'total' | 'updated_by' | 'currency'> & {
  inday: string | null;
  updated_at: Date;
};

/** 新規登録時に仕入伝票（trsiiden）へ渡す値 */
export type SiidenNew = SiidenSet & { id: number; denno: number; created_at: Date; created_by: string };

/** get_siiden クエリの結果 */
interface SiidenResult { trsiiden_by_pk: mwI.Trsiiden | null }
/** upd_siiden ミューテーションの結果 */
export interface UpdSiidenResult { update_trsiiden: mwI.AffectedRows; delete_trsiimei: mwI.AffectedRows; insert_trsiimei: mwI.AffectedRows }
/** ins_siiden ミューテーションの結果 */
export interface InsSiidenResult { insert_trsiiden: mwI.AffectedRows; insert_trsiimei: mwI.AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class SiimeiService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  public siimei = new Array<mwI.Siimei>();; //読込時にfrmsiire⇒smeitblコンポーネントへ渡すときのみ使用
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  private GetTran = gql`
    query get_siiden($dno: Int!, $id: smallint!) {
      trsiiden_by_pk(denno: $dno, id: $id) {
        vcode
        inday
        scode
        tcode
        gtotal
        total
        dmemo
        created_at
        created_by
        updated_at
        updated_by
        currency
        trsiimeis {
          line
          inday
          gcode
          suu
          genka
          money
          taxrate
          mmemo
          spec
          mtax
          tsuu
          hdenno
          hline
          msgood {
            gtext
            unit
          }
        }
      }
    }`;
  qrySiiden(denno: number): Observable<mwI.Trsiiden | null> {
    let observable: Observable<mwI.Trsiiden | null> = new Observable<mwI.Trsiiden | null>(observer => {
      this.apollo.watchQuery<SiidenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          if (!data) {
            return;
          }
          observer.next((data as SiidenResult).trsiiden_by_pk);
        }, (error) => {
          // return reject(error);
          observer.error(error);
        });
    });
    return observable;
  }
  convHatmei(hdenno: number, hatmei: mwI.Trhatden['vhatzns']) {
    this.siimei = new Array<mwI.Siimei>();
    hatmei.forEach((e) => {
      // console.log(e);
      if (e.hatzn > 0) {
        this.siimei.push({
          line: e.line,
          gcode: e.gcode,
          suu: e.hatzn,
          genka: e.genka,
          money: e.money,
          taxrate: e.taxrate,
          mmemo: e.mmemo,
          spec: e.spec,
          hdenno: hdenno,
          hline: e.line,
          inday: '',
          mtax: e.mtax,
          msgood: {
            gtext: e.gtext,
            unit: e.msgood.unit
          }
          // currency:''
        });
      }
    });
  }

  /** 変更保存。伝票・明細・在庫の入荷数（zaiko: 読込時の分の取り消し＋今の分）を 1 トランザクションで書く */
  async updSiiden(denno: number, siiden: SiidenSet, siimei: SiimeiInput[], zaiko: SiiZaiko[] = []): Promise<UpdSiidenResult> {
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const UpdateTran = gql`
      mutation upd_siiden($id: smallint!, $hdno: Int!,$_set: trsiiden_set_input!,$obj:[trsiimei_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        update_trsiiden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trsiimei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trsiimei(objects: $obj) {
          affected_rows
        }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate<UpdSiidenResult>({
      mutation: UpdateTran,
      variables: { id: this.usrsrv.compid, hdno: denno, _set: siiden, obj: siimei, zinit, zinc }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('保存の結果がありません');
    }
    return res.data as UpdSiidenResult;
  }

  /** 新規登録（複数の伝票も）。伝票・明細・在庫の入荷数（zaiko）を 1 トランザクションで書く */
  async insSiiden(siiden: SiidenNew[], siimei: SiimeiInput[], zaiko: SiiZaiko[] = []): Promise<InsSiidenResult> {
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const InsertTran = gql`
      mutation ins_siiden($obj:[trsiiden_insert_input!]!,$objm:[trsiimei_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        insert_trsiiden(objects: $obj)  {
          affected_rows
        }
        insert_trsiimei(objects: $objm)  {
          affected_rows
        }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) { affected_rows }
        update_trzaiko_many(updates: $zinc) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate<InsSiidenResult>({
      mutation: InsertTran,
      variables: { obj: siiden, objm: siimei, zinit, zinc }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('登録の結果がありません');
    }
    return res.data as InsSiidenResult;
  }

  /** 仕入明細から在庫の入荷数（trzaiko.hnyu）の増減を作る。倉庫は仕入伝票の倉庫、日付は入荷日。sign = -1 は読み込んだときの分の取り消し */
  hnyuOf(scode: string | null, inday: string | null, lines: { gcode: string | null; suu: number | string | null }[], sign = 1): SiiZaiko[] {
    if (!scode || !inday) {
      return [];
    }
    return lines.filter(l => l.gcode && Number(l.suu)).map(l => ({ scode, gcode: String(l.gcode), day: inday.slice(0, 10), hnyu: sign * Number(l.suu) }));
  }

  private zaikoRows(list: SiiZaiko[]): { zinit: object[]; zinc: object[] } {
    const id = this.usrsrv.compid;
    const sum = new Map<string, SiiZaiko>();
    for (const z of list) {
      const k = z.scode + '\t' + z.gcode + '\t' + z.day;
      const s = sum.get(k) ?? { ...z, hnyu: 0 };
      s.hnyu += z.hnyu;
      sum.set(k, s);
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    sum.forEach(z => {
      if (z.hnyu == 0) {
        return;
      }
      zinit.push({ id, scode: z.scode, gcode: z.gcode, day: z.day, ...ZAIKO_ZERO });
      zinc.push({ where: { id: { _eq: id }, scode: { _eq: z.scode }, gcode: { _eq: z.gcode }, day: { _eq: z.day } }, _inc: { hnyu: z.hnyu } });
    });
    return { zinit, zinc };
  }

  /** 発注残のある発注明細（発注伝票番号を指定。一括登録の画面） */
  async openOrders(hdennos: number[]): Promise<{ heads: HatHead[]; lines: OpenLine[] }> {
    const Get = gql`
      query get_siiopen($id: smallint!, $d: [Int!]!) {
        trhatden(where: {id: {_eq: $id}, denno: {_in: $d}}) { denno day vcode scode tcode currency }
        vhatzn(where: {id: {_eq: $id}, denno: {_in: $d}}, order_by: [{denno: asc}, {line: asc}]) {
          denno line gcode gtext suu hatzn genka money taxrate mtax spec mmemo yday ydaykbn inday jdenno msgood { unit }
        }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trhatden: HatHead[]; vhatzn: (Omit<OpenLine, 'unit'> & { msgood: { unit: string | null } | null })[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, d: hdennos }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('発注伝票を読めませんでした');
    }
    return {
      heads: res.data.trhatden.map(h => ({ ...h, day: String(h.day ?? '').slice(0, 10) })),
      lines: res.data.vhatzn.map(({ msgood, ...l }) => ({ ...l, unit: msgood?.unit ?? null, suu: Number(l.suu), hatzn: Number(l.hatzn), genka: Number(l.genka ?? 0) }))
    };
  }

  /** 発注残のある発注伝票を探す（仕入先・入荷予定日。一括登録の画面） */
  async findOpen(vcode: string, ydayTo: string): Promise<number[]> {
    const and: object[] = [{ id: { _eq: this.usrsrv.compid } }, { hatzn: { _gt: 0 } }];
    if (ydayTo) {
      and.push({ yday: { _lte: ydayTo } });
    }
    const Get = gql`query find_siiopen($where: vhatzn_bool_exp!) { vhatzn(where: $where, limit: 2000) { denno } }`;
    const res = await firstValueFrom(this.apollo.query<{ vhatzn: { denno: number }[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { where: { _and: and } }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('発注伝票を探せませんでした');
    }
    let dennos = [...new Set(res.data.vhatzn.map(e => e.denno))];
    if (vcode && dennos.length) {
      const GetH = gql`query find_siiopenh($id: smallint!, $d: [Int!]!, $v: String!) { trhatden(where: {id: {_eq: $id}, denno: {_in: $d}, vcode: {_eq: $v}}) { denno } }`;
      const h = await firstValueFrom(this.apollo.query<{ trhatden: { denno: number }[] }>({ query: GetH, variables: { id: this.usrsrv.compid, d: dennos, v: vcode } }));
      dennos = (h.data?.trhatden ?? []).map(e => e.denno);
    }
    return dennos.sort((a, b) => a - b);
  }

  /**
   * 仕入のあと、発注明細の入荷済の印（trhatmei.inday。発注残が 0 になった行に入荷日）と、発注伝票の状況（hdstatus）を直す。
   * 発注残は仕入明細から出しているので、仕入を保存したあとに読み直して決める
   */
  async refreshHatden(hdennos: number[], inday: string, getHdsta: (m: { inday: string | null; yday: string | null; ydaykbn: string }[]) => string): Promise<void> {
    const list = [...new Set(hdennos.filter(d => d > 0))];
    if (list.length == 0) {
      return;
    }
    const { lines } = await this.openOrders(list);
    const id = this.usrsrv.compid;
    const mei = lines.map(l => {
      const done = l.hatzn <= 0;
      const day = done ? (l.inday ? String(l.inday).slice(0, 10) : inday) : null;
      return { where: { id: { _eq: id }, denno: { _eq: l.denno }, line: { _eq: l.line } }, _set: { inday: day }, l: { ...l, inday: day } };
    });
    const den = list.map(d => {
      const ls = mei.filter(m => m.l.denno == d).map(m => ({ inday: m.l.inday, yday: m.l.yday, ydaykbn: String(m.l.ydaykbn ?? '') }));
      return { where: { id: { _eq: id }, denno: { _eq: d } }, _set: { hdstatus: getHdsta(ls) } };
    });
    const Upd = gql`
      mutation upd_hatrecv($mei: [trhatmei_updates!]!, $den: [trhatden_updates!]!) {
        update_trhatmei_many(updates: $mei) { affected_rows }
        update_trhatden_many(updates: $den) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { mei: mei.map(({ where, _set }) => ({ where, _set })), den } }));
    if (res.error) {
      throw res.error;
    }
  }



}
