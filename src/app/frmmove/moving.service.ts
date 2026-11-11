import { Injectable, inject } from '@angular/core';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { UserService } from './../services/user.service';
import { ZAIKO_ZERO } from './../services/jyustock.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';


export class Zaiko {
  scode!: string;
  gcode!: string;
  day!: string;
  movi!: number;
  movo!: number;
}
export class Gzai {
  zcode!: string;
  irisu!: number;
  msgoods!: {
        gskbn: string;
    };
  constructor(init?: Partial<Movden>) {
    Object.assign(this, init);
  }
}

export class Movden {
  line!: number;
  gcode!: string;
  suu!: number;
  pable!: number;
  stock!: number;
  memo!: string;
  jdenno!: number;
  jline!: number;
  kako!: string;
  msgood!: {
        gtext: string;
        unit: string;
        gskbn: string;
        msgzais: Gzai[];
    };
  constructor(init?: Partial<Movden>) {
    Object.assign(this, init);
  }
}



export class Movsub {
  day!: Date;
  incode!: string;
  outcode!: string;
  tcode!: string;
  /** 伝票備考・出荷指示書備考（保存はしていたが、読込で取っていなかった） */
  dmemo!: string;
  omemo!: string;
  smemo!: string;
  /** 出荷指示の送り先（〒・住所・宛名・電話）。空なら入庫倉庫の住所 */
  szip!: string;
  sadr!: string;
  sname!: string;
  stel!: string;
  hday!: Date;
  htime!: string;
  hcode!: string;
  okurino!: number;
  okurisuu!: number;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  /** 倉庫で数量を確認した日時・担当者・内容（スマホで QR → JAN） */
  chk_at?: string | null;
  chk_by?: string | null;
  chkmemo?: string | null;
  trmovdens!: Movden[];
  constructor(init?: Partial<Movsub>) {
    Object.assign(this, init);
  }
}

/** 保存時に移動伝票（trmovsub）の更新へ渡す値。day / hday は日付文字列（未入力は null） */
export type MovsubSet = Pick<Movsub, 'outcode' | 'incode' | 'tcode' | 'hcode' | 'htime' | 'okurisuu' | 'okurino' | 'omemo'> & {
  day: string | null;
  hday: string | null;
  dmemo: string;
  smemo: string;
  szip: string;
  sadr: string;
  sname: string;
  stel: string;
  updated_at: Date;
  updated_by: string;
};
/** 保存時に移動明細（trmovden）へ渡す値 */
export interface MovmeiInput { id: number; denno: number; line: number; gcode: string; suu: number; memo: string; jdenno?: number | null; jline?: number | null }

/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 移動伝票。DB のトリガー（db/20261113_move_check.sql）と同じ値 */
export const EXTYPE_MOVE = '6';

/** 受注伝票の在庫不足から作る移動 1 件（出庫倉庫 → 入庫倉庫ごとに 1 枚の移動伝票にまとめる） */
export interface MoveRequest { outcode: string; incode: string; gcode: string; suu: number; jdenno: number; jline: number; memo: string }

/** 新規登録時に移動伝票（trmovsub）へ渡す値 */
export type MovsubNew = MovsubSet & { id: number; denno: number; created_at: Date; created_by: string };

/** get_movden クエリの結果 */
interface MovdenResult { trmovsub_by_pk: Movsub | null }
/** upd_zaiko / ins_zaiko ミューテーションの結果 */
interface UpdZaikoResult { update_trzaiko: mwI.AffectedRows }
interface InsZaikoResult { insert_trzaiko: mwI.AffectedRows }
/** upd_movsub ミューテーションの結果 */
export interface UpdMovdenResult { update_trmovsub: mwI.AffectedRows; delete_trmovden: mwI.AffectedRows; insert_trmovden: mwI.AffectedRows }
/** ins_movsub ミューテーションの結果 */
export interface InsMovdenResult { insert_trmovsub: mwI.AffectedRows; insert_trmovden: mwI.AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class MovingService {
  usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  // public movmei: Movden[] = []; //読込時にfrmsupply⇒hmeitblコンポーネントへ渡すときのみ使用
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  private GetTran = gql`
    query get_movden($dno: Int!, $id: smallint!) {
      trmovsub_by_pk(denno: $dno, id: $id) {
        day
        incode
        outcode
        tcode
        dmemo
        omemo
        smemo
        szip
        sadr
        sname
        stel
        hday
        htime
        hcode
        okurino
        okurisuu
        created_at
        created_by
        updated_at
        updated_by
        chk_at
        chk_by
        chkmemo
        trmovdens(order_by: {line: asc}) {
          line
          gcode
          suu
          memo
          jdenno
          jline
          msgood {
            gtext
            unit
            gskbn
            msgzais {
              zcode
              irisu
              msgoods {
                gskbn
              }
            }
          }
        }
      }
    }`;

  qryMovden(denno: number): Observable<Movsub | null> {
    let observable: Observable<Movsub | null> = new Observable<Movsub | null>(observer => {
      // 1 回読んだら終える（読み直すたびに前の問い合わせが残り、後からキャッシュの更新で画面を書き換えないように）
      const sub = this.apollo.watchQuery<MovdenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
        // 保存後に読み直すとき、キャッシュの古い内容（保存前）を出さない（在庫の取り消し用データもこの内容から作るため）
        fetchPolicy: 'network-only',
      })
        .valueChanges
        .subscribe((res) => {
          // Apollo（v4）はエラーを結果の error で返す（data は無い）。読み込み中のまま止まらないようエラーにする
          if (res.error) {
            observer.error(res.error);
            return;
          }
          const data = res.data;
          if (!data) {
            return;
          }
          observer.next((data as MovdenResult).trmovsub_by_pk);
          observer.complete();
        }, (error) => {
          observer.error(error);
        });
      return () => sub.unsubscribe();
    });
    return observable;
  }

  updZaiko(zai: Zaiko) {
    const UpdateTran = gql`
      mutation upd_zaiko($id:smallint!,$scd:String!,$gcd:String!,$day:date!,$inc: trzaiko_inc_input!) {
        update_trzaiko(where:{id:{_eq:$id},scode:{_eq:$scd},gcode:{_eq:$gcd},day:{_eq:$day}}, _inc: $inc)  {
          affected_rows
        }
      }`;
    const InsertTran = gql`
      mutation ins_zaiko($obj:[trzaiko_insert_input!]!) {
        insert_trzaiko(objects: $obj) {
          affected_rows
        }
      }`;
    this.apollo.mutate<UpdZaikoResult>({
      mutation: UpdateTran,
      variables: {
        id: this.usrsrv.compid,
        scd: zai.scode,
        gcd: zai.gcode,
        day: zai.day,
        inc: { movi: zai.movi, movo: zai.movo }
      },
    }).subscribe(({ data }) => {
      // console.log(zai, data);
      if ((data as UpdZaikoResult).update_trzaiko.affected_rows == 0) {
        this.apollo.mutate<InsZaikoResult>({
          mutation: InsertTran,
          variables: {
            obj: [{
              id: this.usrsrv.compid,
              scode: zai.scode,
              gcode: zai.gcode,
              day: zai.day,
              movi: zai.movi,
              movo: zai.movo
            }]
          },
        }).subscribe(({ data }) => {
          console.log(zai, data);
        }, (error) => {
          console.log('ins_zaiko error', error);
        });
      }
    }, (error) => {
      console.log('upd_zaiko error', error);
    });
  }

  /**
   * 在庫の増減（取り消し分・加算分）を 倉庫・商品・日付 ごとにまとめ、伝票と同じミューテーションで書く行にする
   * （在庫の行が無ければ作り、移動入庫・移動出庫を加算する）
   */
  zaikoRows(list: Zaiko[]): { zinit: object[]; zinc: object[] } {
    const id = this.usrsrv.compid;
    const sum = new Map<string, Zaiko>();
    for (const z of list) {
      if (!z.scode || !z.gcode || !z.day) {
        continue;
      }
      const k = z.scode + '\t' + z.gcode + '\t' + z.day;
      const s = sum.get(k) ?? { scode: z.scode, gcode: z.gcode, day: z.day, movi: 0, movo: 0 };
      s.movi += Number(z.movi) || 0;
      s.movo += Number(z.movo) || 0;
      sum.set(k, s);
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    sum.forEach(z => {
      if (z.movi == 0 && z.movo == 0) {
        return;
      }
      zinit.push({ id, scode: z.scode, gcode: z.gcode, day: z.day, ...ZAIKO_ZERO });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: z.scode }, gcode: { _eq: z.gcode }, day: { _eq: z.day } },
        _inc: { movi: z.movi, movo: z.movo }
      });
    });
    return { zinit, zinc };
  }

  /** 変更保存。伝票・明細・在庫の増減（zaiko）を 1 トランザクションで書く（途中で失敗しても在庫だけずれない） */
  updMovden(denno: number, movsub: MovsubSet, movmei: MovmeiInput[], zaiko: Zaiko[]): Promise<UpdMovdenResult> {
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const UpdateTran = gql`
      mutation upd_movsub($id: smallint!, $dno: Int!,$_set: trmovsub_set_input!,$obj:[trmovden_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        update_trmovsub(where: {id: {_eq:$id},denno: {_eq:$dno}}, _set: $_set)  {
          affected_rows
        }
        delete_trmovden(where: {id: {_eq:$id},denno: {_eq:$dno}}) {
          affected_rows
        }
        insert_trmovden(objects: $obj) {
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
      this.apollo.mutate<UpdMovdenResult>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno,
          _set: movsub,
          obj: movmei,
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
        return resolve(res.data as UpdMovdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
  /**
   * 受注伝票の在庫不足から移動伝票を作る（出庫倉庫 → 入庫倉庫ごとに 1 枚。移動日は今日）。
   * 明細に受注伝票番号・行番号を入れ、伝票備考は「受注伝票 n の在庫不足から作成」。在庫品（数量区分 0）だけを渡すこと。
   * 伝票・明細・在庫の移動数を 1 トランザクションで書き、作った移動伝票（番号・出庫・入庫）を返す
   */
  async createMoves(reqs: MoveRequest[]): Promise<{ denno: number; outcode: string; incode: string }[]> {
    const groups = new Map<string, MoveRequest[]>();
    for (const r of reqs.filter(e => e.suu > 0 && e.outcode && e.incode && e.outcode != e.incode)) {
      const k = r.outcode + '\t' + r.incode;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    if (groups.size == 0) {
      return [];
    }
    const id = this.usrsrv.compid;
    const now = new Date();
    const by = this.usrsrv.staff?.code;
    const day = this.usrsrv.formatDate(now);
    const subs: MovsubNew[] = [];
    const meis: MovmeiInput[] = [];
    const zaiko: Zaiko[] = [];
    const made: { denno: number; outcode: string; incode: string }[] = [];
    for (const rs of groups.values()) {
      const denno = Number(await this.usrsrv.getNumber('mdenno', 1));
      const { outcode, incode } = rs[0];
      const jdennos = [...new Set(rs.map(r => r.jdenno))];
      subs.push({
        id, denno, day, outcode, incode, tcode: by, hcode: null as unknown as string, hday: null, htime: null as unknown as string,
        okurisuu: null as unknown as number, okurino: null as unknown as number, omemo: null as unknown as string,
        dmemo: '受注伝票' + jdennos.join('・') + 'の在庫不足から作成', smemo: '', szip: '', sadr: '', sname: '', stel: '',
        created_at: now, created_by: by, updated_at: now, updated_by: by
      });
      rs.forEach((r, i) => {
        meis.push({ id, denno, line: i + 1, gcode: r.gcode, suu: r.suu, memo: r.memo, jdenno: r.jdenno, jline: r.jline });
        zaiko.push({ scode: incode, gcode: r.gcode, day, movi: r.suu, movo: 0 }, { scode: outcode, gcode: r.gcode, day, movi: 0, movo: r.suu });
      });
      made.push({ denno, outcode, incode });
    }
    await this.insMovden(subs, meis, zaiko);
    return made;
  }

  /** 受注伝票の明細から作った移動明細（受注伝票の行番号 → 移動伝票番号）。もう移動伝票がある明細には勧めない */
  async movesOf(jdenno: number): Promise<Map<number, number>> {
    const Get = gql`
      query get_jmoves($id: smallint!, $jdno: Int!) {
        trmovden(where: {id: {_eq: $id}, jdenno: {_eq: $jdno}}) { denno jline }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ trmovden: { denno: number; jline: number | null }[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, jdno: jdenno }
    }));
    if (res.error || !res.data) {
      throw res.error ?? new Error('移動伝票を読めませんでした');
    }
    return new Map(res.data.trmovden.filter(e => e.jline != null).map(e => [Number(e.jline), e.denno]));
  }

  /** 新規登録。伝票・明細・在庫の加算（zaiko）を 1 トランザクションで書く */
  insMovden(movsub: MovsubNew[], movmei: MovmeiInput[], zaiko: Zaiko[]): Promise<InsMovdenResult> {
    const { zinit, zinc } = this.zaikoRows(zaiko);
    const InsertTran = gql`
      mutation ins_movsub($obj:[trmovsub_insert_input!]!,$objm:[trmovden_insert_input!]!,
        $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        insert_trmovsub(objects: $obj)  {
          affected_rows
        }
        insert_trmovden(objects: $objm)  {
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
      this.apollo.mutate<InsMovdenResult>({
        mutation: InsertTran,
        variables: {
          obj: movsub,
          objm: movmei,
          zinit,
          zinc
        },
      }).subscribe((res) => {
        if (res.error || !res.data) {
          return reject(res.error ?? new Error('登録の結果がありません'));
        }
        return resolve(res.data as InsMovdenResult);
      }, (error) => {
        return reject(error);
      });
    });
  }
}
