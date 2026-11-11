import { Injectable, inject } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
// import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { HatmeiService, AutoOrders, NO_ORDERS } from './../frmsupply/hatmei.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

/** 受注明細行（jmeitbl.editJyumei が組み立てて trjyumei_insert_input に渡す） */
export type TrjyumeiRow = Pick<mwI.Jyumei, 'line' | 'gcode' | 'gtext' | 'suu' | 'tanka' | 'toutmoney' | 'tinmoney' | 'mmemo' | 'spec' | 'spdet' | 'genka' | 'scode' | 'sday' | 'tanka1' | 'money' | 'mtax' | 'tgenka' | 'taxmoney' | 'taxrate' | 'gskbn' | 'currency'> & {
  id: number;
  denno: number;
};
/** 受注明細の在庫内訳（trjyumzai_insert_input） */
export interface TrjmzaiRow { id: number; denno: number; line: number; eda: number; gcode: string; suu: number; spec: string | null; spdet: string | null }
/** 保存時に受注伝票（trjyuden）へ渡す値。日付は日付文字列（未入力は null） */
export type JyudenSet = Pick<mwI.Jyuden, 'torikbn' | 'updated_by' | 'mcode' | 'scde' | 'ncode' | 'nadr' | 'tcode' | 'scode' | 'skbn' | 'jcode' | 'pcode' | 'hcode' | 'htime' | 'okurisuu' | 'okurino' | 'dmemo' | 'nmemo' | 'omemo' | 'smemo' | 'cusden' | 'ryoate' | 'daibiki' | 'daibzei' | 'daibunrui' | 'chubunrui' | 'shobunrui' | 'tcode1' | 'gtotalzn' | 'soryozn' | 'tesuzn' | 'nebikizn' | 'taxtotal' | 'total' | 'genka' | 'hgenka' | 'egenka' | 'iadr' | 'total8' | 'total10' | 'dokono' | 'jdstatus' | 'bcode' | 'bkcode' | 'del'> & {
  updated_at: Date;
  buntype: string;
  eidome: string | null;
  eicode: string | null;
  day: string | null;
  yday: string | null;
  sday: string | null;
  uday: string | null;
  nday: string | null;
  hday: string | null;
};
/** 新規登録時に受注伝票（trjyuden）へ渡す値 */
export type JyudenNew = JyudenSet & { id: number; denno: number; created_at: Date; created_by: string };
interface JyudenResult { trjyuden_by_pk: mwI.Trjyuden }
interface ZaikoUpdateResult { update_trzaiko: mwI.AffectedRows }
interface ZaikoInsertResult { insert_trzaiko: mwI.AffectedRows }
export interface JyudenUpdateResult { update_trjyuden: mwI.AffectedRows; delete_trjyumei: mwI.AffectedRows; insert_trjyumei: mwI.AffectedRows; delete_trjyumzai: mwI.AffectedRows; insert_trjyumzai: mwI.AffectedRows }
export interface JyudenInsertResult { insert_trjyuden: mwI.AffectedRows; insert_trjyumei: mwI.AffectedRows; insert_trjyumzai: mwI.AffectedRows }
interface JyudenDeleteResult { update_trjyuden: mwI.AffectedRows }
@Injectable({
  providedIn: 'root'
})
export class JyumeiService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);
  private hmisrv = inject(HatmeiService);

  // public jyumei: mwI.Jyumei[] = []; //frmsales⇒jmeitblコンポーネントへ渡すときのみ使用
  public trjyumei: TrjyumeiRow[] = [];
  public trjmzai: TrjmzaiRow[] = [];
  /** 保存後に加算する在庫データ（editJyumei が作成。読込時に作る取り消し用 trzaiko と対になる） */
  public zaikoNew: mwI.Zaiko[] = [];
  public denno: number = 0;
  public mtax!: string;             //顧客マスタ「税区分」
  public tankakbn!: string;         //顧客マスタ「単価区分」
  public sptnkbn!: string;          //顧客マスタ「特別単価区分」
  // public souko:string;
  public ntype!: string;            //顧客マスタ「納品書タイプ」
  public tntype!: string;           //顧客マスタ「直送納品書タイプ」
  public address: string = "";
  public dmemo: string = "";
  public obisu: number = 0;
  public iaddress: string = "";
  public trzaiko: mwI.Zaiko[] = [];
  /**
   * 明細を変えられない理由（入金済・締め日以前）。空でなければ、変更のときも明細の品番・数量・単価と行の追加・削除はできない
   * （明細の商品名・明細備考は変えられる）
   */
  public meiLock: string = '';
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  public isSaving!: boolean;

  private GetTran = gql`
    query get_jyuden($id: smallint!,$dno: Int!) {
      trjyuden_by_pk(denno: $dno, id: $id) {
        denno
        jdstatus
        torikbn
        created_at
        created_by
        updated_at
        updated_by
        del
        mcode
        scde
        ncode
        nadr
        buntype
        day
        yday
        sday
        uday
        nday
        tcode
        scode
        skbn
        jcode
        pcode
        hcode
        hday
        htime
        okurisuu
        okurino
        dmemo
        nmemo
        omemo
        smemo
        cusden
        ryoate
        daibiki
        daibunrui
        chubunrui
        shobunrui
        tcode1
        gtotalzn
        soryozn
        tesuzn
        nebikizn
        taxtotal
        total
        genka
        hgenka
        egenka
        iadr
        total8
        total10
        dokono
        daibzei
        idenno
        bcode
        bkcode
		vnyuzan {
          nyuzan
        }
        trjyumeis(order_by: {line: asc}) {
          line
          gcode
          gtext
          suu
          tanka
          toutmoney
          tinmoney
          mmemo
          spec
          spdet
          genka
          scode
          sday
          tanka1
          money
          mtax
          tgenka
          taxmoney
          taxrate
          gskbn
          currency
          msgood {
            unit
            max
            koguchi
            ordering
            send
            hgcode
            tanano
            msggroup {
              vcode
              gkbn
              code
            }
            msgzais {
              zcode
              irisu
              msgoods {
                gskbn
              }
            }
          }
          trjyumzais {
            eda
            gcode
            suu
            spec
            spdet
          }
        }
      }
    }`;

  qryJyuden(denno: number): Observable<mwI.Trjyuden | null> {
    let observable: Observable<mwI.Trjyuden | null> = new Observable<mwI.Trjyuden | null>(observer => {
      this.apollo.watchQuery<JyudenResult>({
        query: this.GetTran,
        variables: {
          id: this.usrsrv.compid,
          dno: denno
        },
        // 読み直したときに、キャッシュの古い内容（受注ステータスなど）を出さないよう、毎回サーバーから読む
        fetchPolicy: 'network-only',
      })
        .valueChanges
        .subscribe((res) => {
          // Apollo v4 はエラーを data なしの結果で返す。止まったままにならないよう、エラーとして渡す
          if (res.error && !res.data) {
            observer.error(res.error);
            return;
          }
          if (!res.data) {
            return;
          }
          observer.next((res.data as JyudenResult).trjyuden_by_pk);
        }, (error) => {
          observer.error(error);
        });
    });
    return observable;
  }

  /**
   * 入金済か（入金が 1 件でも登録されているか）。受注伝票の読み込みとは別に読む
   * （読めなかったときは、伝票の照会を止めないように false にする）
   */
  async isPaid(denno: number): Promise<boolean> {
    const Get = gql`
      query get_paid($id: smallint!, $dno: Int!) {
        vnyuzan(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
          trnyusubs(where: {_or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, limit: 1) { denno }
        }
      }`;
    try {
      const res = await firstValueFrom(this.apollo.query<{ vnyuzan: { trnyusubs: { denno: number }[] }[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }, errorPolicy: 'all'
      }));
      if (res.error) {
        throw res.error;
      }
      return ((res.data as { vnyuzan: { trnyusubs: { denno: number }[] }[] } | undefined)?.vnyuzan[0]?.trnyusubs?.length ?? 0) > 0;
    } catch (e) {
      console.log('error query get_paid', e);
      return false;
    }
  }
  async getDenno() {
    if (this.denno == 0) {
      return await this.usrsrv.getNumber('jdenno', 1);
    } else {
      return this.denno;
    }
  }

  updZaiko(zai: mwI.Zaiko) {
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
    this.apollo.mutate<ZaikoUpdateResult>({
      mutation: UpdateTran,
      variables: {
        id: this.usrsrv.compid,
        scd: zai.scode,
        gcd: zai.gcode,
        day: zai.day,
        inc: { syuk: zai.suu }
      },
    }).subscribe(({ data }) => {
      // console.log(zai, data);
      if ((data as ZaikoUpdateResult).update_trzaiko.affected_rows == 0) {
        this.apollo.mutate<ZaikoInsertResult>({
          mutation: InsertTran,
          variables: {
            obj: [{
              id: this.usrsrv.compid,
              scode: zai.scode,
              gcode: zai.gcode,
              day: zai.day,
              syuk: zai.suu
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

  /** 受注伝票の保存で一緒に作る発注伝票を、ミューテーションの変数にする */
  private orderVars(orders: AutoOrders) {
    const { zinit, zinc } = this.hmisrv.hatuRows(orders.zaiko);
    return { hden: orders.hatden, hmei: orders.hatmei, zinit, zinc };
  }

  /**
   * 変更保存。受発注の明細から作った発注伝票（orders。発注伝票・明細・在庫の発注数）も、同じトランザクションで書く
   * （受注明細に発注伝票番号だけが入って発注伝票が無い、ということが起きないように）
   */
  updJyuden(denno: number, jyuden: JyudenSet, jyumei: TrjyumeiRow[], jyumzai: TrjmzaiRow[], orders: AutoOrders = NO_ORDERS): Promise<JyudenUpdateResult> {
    const UpdateTran = gql`
      mutation upd_jyuden($id: smallint!, $hdno: Int!,$_set: trjyuden_set_input!,$obj:[trjyumei_insert_input!]!,$obj2:[trjyumzai_insert_input!]!,
        $hden: [trhatden_insert_input!]!, $hmei: [trhatmei_insert_input!]!, $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        insert_trhatden(objects: $hden) {
          affected_rows
        }
        insert_trhatmei(objects: $hmei) {
          affected_rows
        }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) {
          affected_rows
        }
        update_trzaiko_many(updates: $zinc) {
          affected_rows
        }
        update_trjyuden(where: {id: {_eq:$id},denno: {_eq:$hdno}}, _set: $_set)  {
          affected_rows
        }
        delete_trjyumei(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trjyumei(objects: $obj) {
          affected_rows
        }
        delete_trjyumzai(where: {id: {_eq:$id},denno: {_eq:$hdno}}) {
          affected_rows
        }
        insert_trjyumzai(objects: $obj2) {
          affected_rows
        }      
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<JyudenUpdateResult>({
        mutation: UpdateTran,
        variables: {
          id: this.usrsrv.compid,
          hdno: denno,
          _set: jyuden,
          obj: jyumei,
          obj2: jyumzai,
          ...this.orderVars(orders)
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
        return resolve(res.data as JyudenUpdateResult);
      }, (error) => {
        return reject(error);
      });
    });
  }

  /** 新規登録。受発注の明細から作った発注伝票（orders）も、同じトランザクションで書く */
  insJyuden(jyuden: JyudenNew[], jyumei: TrjyumeiRow[], jyumzai: TrjmzaiRow[], orders: AutoOrders = NO_ORDERS): Promise<JyudenInsertResult> {
    const InsertTran = gql`
      mutation ins_jyuden($obj:[trjyuden_insert_input!]!,$objm:[trjyumei_insert_input!]!,$obj2:[trjyumzai_insert_input!]!,
        $hden: [trhatden_insert_input!]!, $hmei: [trhatmei_insert_input!]!, $zinit: [trzaiko_insert_input!]!, $zinc: [trzaiko_updates!]!) {
        insert_trjyuden(objects: $obj)  {
          affected_rows
        }
        insert_trhatden(objects: $hden) {
          affected_rows
        }
        insert_trhatmei(objects: $hmei) {
          affected_rows
        }
        insert_trzaiko(objects: $zinit, on_conflict: {constraint: trzaiko_pkey, update_columns: []}) {
          affected_rows
        }
        update_trzaiko_many(updates: $zinc) {
          affected_rows
        }
        insert_trjyumei(objects: $objm)  {
          affected_rows
        }
        insert_trjyumzai(objects: $obj2) {
          affected_rows
        }  
      }`;
    return new Promise((resolve, reject) => {
      this.apollo.mutate<JyudenInsertResult>({
        mutation: InsertTran,
        variables: {
          obj: jyuden,
          objm: jyumei,
          obj2: jyumzai,
          ...this.orderVars(orders)
        },
      }).subscribe((res) => {
        if (res.error || !res.data) {
          return reject(res.error ?? new Error('登録の結果がありません'));
        }
        return resolve(res.data as JyudenInsertResult);
      }, (error) => {
        return reject(error);
      });
    });
  }

  delJyuden(denno: string | number, flg: boolean): void {
    const DeleteTran = gql`
      mutation del_jyuden($id: smallint!, $dno: Int!, $flg: Boolean, $uat: timestamptz!, $uby: String!) {
        update_trjyuden(where: {id: {_eq:$id},denno: {_eq:$dno}}, _set: {del: $flg, updated_at: $uat, updated_by: $uby})  {
          affected_rows
        }
      }`;

    this.apollo.mutate<JyudenDeleteResult>({
      mutation: DeleteTran,
      variables: {
        id: this.usrsrv.compid,
        dno: denno,
        flg: flg,
        uat: new Date(),
        uby: this.usrsrv.staff.code
      },
      refetchQueries: [
        {
          query: this.GetTran,
          variables: {
            id: this.usrsrv.compid,
            dno: denno
          },
        }],
    }).subscribe(({ data }) => {
      this.usrsrv.toastSuc('受注伝票' + denno + 'を変更しました');
      // trzaiko は読込時の在庫内訳を「符号反転」したもの。取消(flg=true)ではそのまま適用し、
      // 取消解除(flg=false)では符号を戻して加算する。元データは書き換えない（後続の保存で再利用されるため）
      this.trzaiko.forEach(e => {
        this.updZaiko(flg ? e : { ...e, suu: e.suu * -1 });
      });
    }, (error) => {
      this.usrsrv.toastErr('データベースエラー', '受注伝票' + denno + 'の取消(解除)ができませんでした');
      console.log('error del_jyuen', error);
    });
  }

  getJdsta(hmei: unknown): string {

    let ret: string = "";

    return ret;
  }
}