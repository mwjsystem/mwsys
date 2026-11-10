import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import { ZAIKO_ZERO } from './../services/jyustock.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 保存時に発注明細（trhatmei）へ渡す値。day / yday は日付文字列（未入力は null） */
export type HatmeiInput = Pick<mwI.Hatmei, 'line' | 'inday' | 'gcode' | 'gtext' | 'suu' | 'genka' | 'money' | 'taxrate' | 'mmemo' | 'spec' | 'jdenno' | 'jline' | 'yday' | 'ydaykbn' | 'mtax'> & {
  id: number;
  denno: number;
  day: string | null;
};
/** 保存時に発注伝票（trhatden）の更新へ渡す値。day は日付文字列 */
export type HatdenSet = Pick<mwI.Hatden, 'vcode' | 'scode' | 'tcode' | 'dmemo' | 'gtotal' | 'tax' | 'total' | 'updated_by' | 'currency'> & {
  day: string | null;
  autoproc: boolean | string;
  inmemo: string;
  updated_at: Date;
};

/** 新規登録時に発注伝票（trhatden）へ渡す値。hdstatus は発注状況 */
export type HatdenNew = HatdenSet & { id: number; denno: number; created_at: Date; created_by: string; hdstatus: string };

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 発注伝票。DB のトリガー（db/20261111_hatden_order.sql）と同じ値 */
export const EXTYPE_HATDEN = '2';

/** 在庫（trzaiko）の発注数（hatu）の増減 1 件。発注伝票の倉庫・発注日・商品ごと */
export interface HatuZaiko { scode: string; gcode: string; day: string; hatu: number }

/** 発注数の増減を、伝票と同じミューテーションで書く行（在庫の行が無ければ 0 で作ってから加算する） */
export interface HatuRows { zinit: object[]; zinc: object[] }

/** 受注伝票の保存で一緒に作る発注伝票（受発注の明細から、仕入先・倉庫ごと） */
export interface AutoOrders {
  hatden: HatdenNew[];
  hatmei: HatmeiInput[];
  zaiko: HatuZaiko[];
  /** 作った発注伝票（伝票番号と仕入先） */
  made: { denno: number; vcode: string }[];
}
export const NO_ORDERS: AutoOrders = { hatden: [], hatmei: [], zaiko: [], made: [] };

/** get_hatden クエリの結果 */
interface HatdenResult { trhatden_by_pk: mwI.Trhatden | null }
/** upd_hatden ミューテーションの結果 */
export interface UpdHatdenResult { update_trhatden: mwI.AffectedRows; delete_trhatmei: mwI.AffectedRows; insert_trhatmei: mwI.AffectedRows }
/** ins_hatden ミューテーションの結果 */
export interface InsHatdenResult { insert_trhatden: mwI.AffectedRows; insert_trhatmei: mwI.AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class HatmeiService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  public hatmei: mwI.Hatmei[] = []; //読込時にfrmsupply⇒hmeitblコンポーネントへ渡すときのみ使用
  // public subject = new Subject<mwI.Hatmei[]>();
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  private GetTran = gql`
    query get_hatden($dno: Int!, $id: smallint!) {
      trhatden_by_pk(denno: $dno, id: $id) {
        vcode
        day
        scode
        tcode
        autoproc
        gtotal
        jdenno
        total
        dmemo
        inmemo
        created_at
        created_by
        tax
        updated_at
        updated_by
        currency
        msvendor {
          mtax
        }
        vhatzns {
          day
          gcode
          gtext
          inday
          jdenno
          jline
          line
          mmemo
          money
          spec
          genka
          suu
          taxrate
          yday
          ydaykbn
          mtax
          hatzn
          msgood {
            unit
          }
        }
      }
    }`;

  /**
   * 発注明細から、在庫の発注数（trzaiko.hatu）の増減を作る。倉庫は発注伝票の倉庫、日付は発注日。
   * sign = -1 は読み込んだときの分の取り消し（変更の保存で、前の発注数を引いてから今の発注数を足す）
   */
  hatuOf(scode: string | null, day: string | Date | null, lines: { gcode: string | null; suu: number | string | null }[], sign = 1): HatuZaiko[] {
    if (!scode || !day) {
      return [];
    }
    const d = typeof day == 'string' ? day.slice(0, 10) : this.usrsrv.formatDate(day);
    return lines
      .filter(l => l.gcode && Number(l.suu))
      .map(l => ({ scode, gcode: String(l.gcode), day: d, hatu: sign * Number(l.suu) }));
  }

  /** 発注数の増減を 倉庫・商品・日付 ごとにまとめ、伝票と同じミューテーションで書く行にする */
  hatuRows(list: HatuZaiko[]): HatuRows {
    const id = this.usrsrv.compid;
    const sum = new Map<string, HatuZaiko>();
    for (const z of list) {
      const k = z.scode + '\t' + z.gcode + '\t' + z.day;
      const s = sum.get(k) ?? { ...z, hatu: 0 };
      s.hatu += z.hatu;
      sum.set(k, s);
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    sum.forEach(z => {
      if (z.hatu == 0) {
        return;
      }
      zinit.push({ id, scode: z.scode, gcode: z.gcode, day: z.day, ...ZAIKO_ZERO, hatu: 0 });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: z.scode }, gcode: { _eq: z.gcode }, day: { _eq: z.day } },
        _inc: { hatu: z.hatu }
      });
    });
    return { zinit, zinc };
  }

  qryHatden(denno: number): Observable<mwI.Trhatden | null> {
    // console.log(denno);
    // return new Promise( (resolve,reject) => {
    let observable: Observable<mwI.Trhatden | null> = new Observable<mwI.Trhatden | null>(observer => {
      this.apollo.watchQuery<HatdenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
        // 受注伝票から自動で作った発注伝票などを、キャッシュの古い内容で出さないよう毎回サーバーから読む
        fetchPolicy: 'network-only',
      })
        .valueChanges
        .subscribe((res) => {
          if (res.error && !res.data) {
            observer.error(res.error);
            return;
          }
          if (!res.data) {
            return;
          }
          observer.next((res.data as HatdenResult).trhatden_by_pk);
        }, (error) => {
          // return reject(error);
          observer.error(error);
        });
    });
    return observable;
  }
  /** 変更保存。伝票・明細・在庫の発注数（zaiko: 読込時の分の取り消し＋今の分）を 1 トランザクションで書く */
  updHatden(denno: number, hatden: HatdenSet, hatmei: HatmeiInput[], zaiko: HatuZaiko[] = []): Promise<UpdHatdenResult> {
    const { zinit, zinc } = this.hatuRows(zaiko);
    const UpdateTran = gql`
      mutation upd_hatden($id: smallint!, $hdno: Int!,$_set: trhatden_set_input!,$obj:[trhatmei_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        update_trhatden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trhatmei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trhatmei(objects: $obj) {
          affected_rows
        }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) {
          affected_rows
        }
        update_trzaiko_many(updates: $zinc) {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<UpdHatdenResult>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: hatden,
          obj: hatmei,
          zinit,
          zinc
        },
        refetchQueries: [
          {
            query: this.GetTran,
            variables: {
              id: this.usrsrv.compid,
              dno: denno
            },
          }],
      }).subscribe((res) => {
        // Apollo（v4）はエラーを例外ではなく結果の error で返すことがある
        if (res.error || !res.data) {
          return reject(res.error ?? new Error('保存の結果がありません'));
        }
        return resolve(res.data as UpdHatdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  /** 新規登録。伝票・明細・在庫の発注数（zaiko）を 1 トランザクションで書く */
  insHatden(hatden: HatdenNew[], hatmei: HatmeiInput[], zaiko: HatuZaiko[] = []): Promise<InsHatdenResult> {
    const { zinit, zinc } = this.hatuRows(zaiko);
    const InsertTran = gql`
      mutation ins_hatden($obj:[trhatden_insert_input!]!,$objm:[trhatmei_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        insert_trhatden(objects: $obj)  {
          affected_rows
        }
        insert_trhatmei(objects: $objm)  {
          affected_rows
        }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) {
          affected_rows
        }
        update_trzaiko_many(updates: $zinc) {
          affected_rows
        }
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<InsHatdenResult>({
        mutation: InsertTran,
        variables: {
          obj: hatden,
          objm: hatmei,
          zinit,
          zinc
        },
      }).subscribe((res) => {
        if (res.error || !res.data) {
          return reject(res.error ?? new Error('登録の結果がありません'));
        }
        return resolve(res.data as InsHatdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  getHdsta(hmei: Pick<mwI.Hatmei, 'inday' | 'yday' | 'ydaykbn'>[]): string {
    let flg0: boolean = false;//発注済
    let flg1: boolean = false;//入荷予定あり
    let flg2: boolean = false;//入荷確定あり
    let flg3: boolean = false;//仕入済あり
    let ret: string = "";

    hmei.forEach((e) => {
      if (e.inday) {
        flg3 = true;
      } else if (e.yday && e.ydaykbn == '0') {
        flg2 = true;
      } else if (e.yday && e.ydaykbn == '1') {
        flg1 = true;
      } else {
        flg0 = true;
      }
    });
    if (flg3 && !flg2 && !flg1 && !flg0) {
      ret = '5';
    } else if (flg3 && (flg2 || flg1 || flg0)) {
      ret = '4';
    } else if (flg2 && !flg1 && !flg0) {
      ret = '3';
    } else if (flg2 && (flg1 || flg0)) {
      ret = '2';
    } else {
      ret = '1';
    }
    return ret;
  }
}
