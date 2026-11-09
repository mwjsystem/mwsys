import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { UserService } from './user.service';

/**
 * 締め日（mssystem.closeday）。締め日以前の売上日の受注伝票は金額に関わる項目を変えられず、
 * 出荷日・売上日に締め日以前の日付を入れられない。
 * 列がまだ無い環境でも画面が動くように、システムマスタの読み込みとは別に読む（読めなければ締め日なし）
 */
@Injectable({
  providedIn: 'root'
})
export class ClosedayService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  /** 締め日（yyyy-mm-dd）。未設定・読めないときは空 */
  closeday = '';
  /** 読めなかったときの理由（画面に出す） */
  error = '';
  private loading?: Promise<string>;

  /** 締め日を読む（2 回目以降は読み込み済みのものを返す。force で読み直す） */
  load(force = false): Promise<string> {
    if (!this.loading || force) {
      this.loading = (async () => {
        const Get = gql`
          query get_closeday($id: smallint!) {
            mssystem(where: {id: {_eq: $id}}) { closeday }
          }`;
        try {
          await this.usrsrv.staffReady;
          const res = await firstValueFrom(this.apollo.query<{ mssystem: { closeday: string | null }[] }>({
            query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid }, errorPolicy: 'all'
          }));
          if (res.error) {
            throw res.error;
          }
          this.closeday = (res.data as { mssystem: { closeday: string | null }[] } | undefined)?.mssystem[0]?.closeday ?? '';
          this.error = '';
        } catch (e) {
          this.closeday = '';
          this.error = (e as Error).message;
          console.log('error query get_closeday', e);
        }
        return this.closeday;
      })();
    }
    return this.loading;
  }

  /** 締め日を保存する（空なら締め日なし） */
  async save(day: string): Promise<void> {
    const Upd = gql`
      mutation upd_closeday($id: smallint!, $day: date) {
        update_mssystem(where: {id: {_eq: $id}}, _set: {closeday: $day}) { affected_rows }
      }`;
    const res = await firstValueFrom(this.apollo.mutate<{ update_mssystem: { affected_rows: number } }>({
      mutation: Upd, variables: { id: this.usrsrv.compid, day: day || null }
    }));
    if (res.error) {
      throw res.error;
    }
    if (!res.data?.update_mssystem?.affected_rows) {
      throw new Error('システムマスタを更新できませんでした（権限を確認してください）');
    }
    this.closeday = day;
    this.loading = Promise.resolve(day);
  }

  /** その日付（Date か yyyy-mm-dd）が締め日以前か */
  isClosed(day: Date | string | null | undefined): boolean {
    if (!this.closeday || day == null || day === '') {
      return false;
    }
    const s = typeof day == 'string' ? day.slice(0, 10) : this.usrsrv.formatDate(day);
    return s <= this.closeday;
  }
}
