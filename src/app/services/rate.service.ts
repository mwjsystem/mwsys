import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './user.service';

/** 為替レートの 1 行（msrate。適用開始日から次の行の前日まで） */
export interface RateRow { currency: string; day: string; rate: number }

/** 読み直すまでの時間（為替レートマスタを直したら、遅くともこの時間で画面に反映される） */
const TTL = 10 * 60 * 1000;

/**
 * 為替レート（外貨 → 円）。為替レートマスタ（msrate、/mstetc/rate）を会社ごとにまとめて読み、
 * 日付ごとのレート（その日以前で一番新しい適用開始日の行）を返す。
 * マスタに行が無い通貨・日付は、今までの 1 つだけのレート（mssystem.currate）を使う。
 */
@Injectable({
  providedIn: 'root'
})
export class RateService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  private rows?: Promise<RateRow[]>;
  private at = 0;

  /** マスタを読む（一度読んだら TTL のあいだ使い回す。読めなかったときは次に読み直す） */
  load(force = false): Promise<RateRow[]> {
    if (!this.rows || force || Date.now() - this.at > TTL) {
      const Get = gql`
        query get_rates($id: smallint!) {
          msrate(where: {id: {_eq: $id}}, order_by: [{currency: asc}, {day: desc}]) { currency day rate }
        }`;
      this.at = Date.now();
      this.rows = this.usrsrv.compidReady
        .then(id => firstValueFrom(this.apollo.query<{ msrate: RateRow[] }>({ query: Get, variables: { id }, fetchPolicy: 'network-only' })))
        .then(res => {
          if (res.error || !res.data) {
            throw res.error ?? new Error('為替レートマスタを読めませんでした');
          }
          return res.data.msrate.map(r => ({ currency: r.currency.trim(), day: String(r.day).slice(0, 10), rate: Number(r.rate) }));
        });
      this.rows.catch(e => {
        console.log('error rate load', e);
        this.rows = undefined;
      });
    }
    return this.rows;
  }

  /** マスタの、その日のレート（JPY は 1。行が無ければ null） */
  async lookup(currency: string | null | undefined, day?: string | Date | null): Promise<number | null> {
    const c = (currency ?? '').trim() || 'JPY';
    if (c == 'JPY') {
      return 1;
    }
    const d = this.usrsrv.formatDate(day ?? new Date());
    let rows: RateRow[];
    try {
      rows = await this.load();
    } catch {
      return null;
    }
    // 適用開始日の新しい順に並んでいる
    return rows.find(r => r.currency == c && r.day <= d)?.rate ?? null;
  }

  /** その日のレート。マスタに無ければ今までのレート（mssystem.currate） */
  async rate(currency: string | null | undefined, day?: string | Date | null): Promise<number> {
    return (await this.lookup(currency, day)) ?? Number(this.usrsrv.system.currate ?? 0);
  }
}
