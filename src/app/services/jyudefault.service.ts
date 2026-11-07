import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './user.service';

/** 出荷対象区分（分類マスタ kubun = 'skbn'）の売上出荷。受注伝票画面の新規の初期値と同じ */
export const SKBN_URIAGE = '0';

/** 受注取込（おちゃのこ・Amazon）で受注伝票に入れる初期値 */
@Injectable({
  providedIn: 'root'
})
export class JyuDefaultService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);
  private buntypes?: Promise<string[]>;

  /** 出荷予定日の初期値: 今日の翌稼働日（土日・休日マスタの日を飛ばす。受注伝票画面の新規と同じ） */
  yday(): string {
    return this.usrsrv.formatDate(this.usrsrv.getNextday(new Date()));
  }

  /** 納品書タイプの番号を、納品書タイプマスタのコードの書き方（'01' か '1' か）に合わせる。マスタに無ければエラー */
  async buntype(no: number): Promise<string> {
    if (!this.buntypes) {
      const Get = gql`
        query get_jyudef_buntype($id: smallint!) {
          msbuntype(where: {id: {_eq: $id}}) { code }
        }`;
      this.buntypes = firstValueFrom(this.apollo.query<{ msbuntype: { code: string }[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid }
      })).then(res => {
        if (res.error || !res.data) {
          throw new Error('納品書タイプを読めませんでした');
        }
        return res.data.msbuntype.map(e => e.code);
      });
      this.buntypes.catch(() => this.buntypes = undefined);
    }
    const code = (await this.buntypes).find(c => Number(c) == no);
    if (code == null) {
      throw new Error('納品書タイプ ' + no + ' がマスタにありません');
    }
    return code;
  }
}
