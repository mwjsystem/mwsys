import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './user.service';

/** 商品の在庫区分（0:在庫対象 1:セット品 2:在庫対象外）と、セット品の構成 */
export interface JyuStock {
  gsk: Map<string, string>;
  gz: Map<string, { zcode: string; irisu: number }[]>;
  zgsk: Map<string, string>;
}

/**
 * 在庫（trzaiko）の行を新しく作るときの数量の列の初期値。
 * 行が無ければ作ってから _inc で加算するため、列が NULL で作られると NULL + n = NULL になり加算が消える。明示的に 0 で作る
 */
export const ZAIKO_ZERO = { hnyu: 0, movi: 0, teni: 0, nyuk: 0, syuk: 0, movo: 0, teno: 0, haki: 0, jyut: 0 };

/** 受注明細 1 行分の在庫に関わる値 */
export interface JyuStockLine { line: number; gcode: string; suu: number }

/** 受注の登録で一緒に書く 明細在庫・在庫の行 */
export interface JyuStockRows { mzai: object[]; zinit: object[]; zinc: object[] }

/**
 * 受注の取込（おちゃのこ・Amazon）で共通の、明細在庫（trjyumzai）と在庫の受注数（trzaiko.jyut）の作成。
 * 画面の受注伝票と同じく、在庫対象は商品自身、セット品は在庫対象の構成品を引き当てる。
 */
@Injectable({
  providedIn: 'root'
})
export class JyuStockService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  private async goods(codes: string[], gsk: Map<string, string>, gz: Map<string, { zcode: string; irisu: number }[]>) {
    const Get = gql`
      query get_jyustock_goods($id: smallint!, $gcodes: [String!]!) {
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) { gcode gskbn }
        msgzai(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}, order_by: [{gcode: asc}, {zcode: asc}]) { gcode zcode irisu }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ msgoods: { gcode: string; gskbn: string | null }[]; msgzai: { gcode: string; zcode: string; irisu: number }[] }>(
      { query: Get, variables: { id: this.usrsrv.compid, gcodes: codes }, fetchPolicy: 'network-only' }));
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? '商品マスタを取得できませんでした');
    }
    res.data.msgoods.forEach(e => gsk.set(e.gcode, (e.gskbn ?? '').trim()));
    res.data.msgzai.forEach(e => {
      const list = gz.get(e.gcode) ?? [];
      list.push({ zcode: e.zcode, irisu: Number(e.irisu) });
      gz.set(e.gcode, list);
    });
  }

  /** 商品マスタで在庫対象を判定する（採番より前に呼ぶ）。使えない商品があれば例外 */
  async check(codes: string[]): Promise<JyuStock> {
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
    return { gsk, gz, zgsk };
  }

  /** 明細在庫と、在庫の行（無ければ作成）・受注数の加算 */
  rows(st: JyuStock, denno: number, scode: string, day: string, lines: JyuStockLine[]): JyuStockRows {
    const id = this.usrsrv.compid;
    const zai = new Map<string, number>();
    const addQty = (g: string, n: number) => zai.set(g, (zai.get(g) ?? 0) + n);
    const mzai: object[] = [];
    for (const l of lines) {
      const kbn = st.gsk.get(l.gcode);
      if (kbn == '0') { // 在庫対象：商品自身
        mzai.push({ id, denno, line: l.line, eda: 1, gcode: l.gcode, suu: l.suu });
        addQty(l.gcode, l.suu);
      } else if (kbn == '1') { // セット品：在庫対象の構成品のみ
        let eda = 0;
        for (const c of st.gz.get(l.gcode) ?? []) {
          if (st.zgsk.get(c.zcode) == '0') {
            const n = Math.round(l.suu * c.irisu);
            eda++;
            mzai.push({ id, denno, line: l.line, eda, gcode: c.zcode, suu: n });
            addQty(c.zcode, n);
          }
        }
      }
    }
    const zinit: object[] = [];
    const zinc: object[] = [];
    zai.forEach((qty, gcode) => {
      zinit.push({ id, scode, gcode, day, ...ZAIKO_ZERO });
      zinc.push({
        where: { id: { _eq: id }, scode: { _eq: scode }, gcode: { _eq: gcode }, day: { _eq: day } },
        _inc: { jyut: qty }
      });
    });
    return { mzai, zinit, zinc };
  }
}
