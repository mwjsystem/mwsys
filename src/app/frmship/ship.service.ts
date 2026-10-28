import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { OkuriService } from './../services/okuri.service';
import { NasService } from './../services/nas.service';
import { NAS_SHIP } from './../share/nasfolder/nasfolder.component';
import { ShipPdfService, ShipAdr, ShipDoc, ShipLine, ShipSystem } from './ship-pdf.service';
import { JDST, denForm, shipNote } from './ship-forms';

/** 受注一覧の 1 行 */
export interface ShipRow {
  denno: number;
  mcode: string;
  ncode: string | null;
  nadr: number | null;
  buntype: string | null;
  sday: string | null;
  hday: string | null;
  hcode: string | null;
  okurisuu: number | null;
  okurino: string | null;
  tcode: string | null;
  jdstatus: string | null;
  shipdir: string | null;
  ship_at: string | null;
  print_at: string | null;
  pick_at: string | null;
  total: number | null;
  denku: number | null;
  keep: string | null;
  /** 画面のチェック */
  chk?: boolean;
}

/** 受注一覧の絞り込み */
export interface ShipFilter {
  /** 出荷予定日（から・まで。yyyy-mm-dd） */
  from: string;
  to: string;
  /** 担当者（空は全担当者） */
  tcode: string | null;
  /** 受注ステータス（空はすべて） */
  jdstatus: string[];
  /** 伝票番号（指定したときは、ほかの条件を使わない） */
  denno?: number;
}

/** 出荷指示フォルダの保存結果（1 伝票） */
export interface ShipResult {
  denno: number;
  /** 保存したフォルダ（NAS の保存先からの相対パス）。失敗は空 */
  dir: string;
  /** 差し替え（別フォルダ）で保存した */
  sasikae: boolean;
  /** 失敗の理由 */
  error: string;
}

interface JyudenQ {
  denno: number; mcode: string; ncode: string | null; nadr: number | null; iadr: number | null; buntype: string | null;
  sday: string | null; uday: string | null; hcode: string | null; okurisuu: number | null; okurino: string | null;
  tcode: string | null; pcode: string | null; dmemo: string | null; nmemo: string | null; keep: string | null;
  total: number | null; taxtotal: number | null; gtotalzn: number | null; soryozn: number | null; tesuzn: number | null; nebikizn: number | null;
  total8: number | null; total10: number | null; denku: number | null; jdstatus: string | null; shipdir: string | null;
}
interface LoadResult {
  trjyuden: JyudenQ[];
  trjyumei: (Omit<ShipLine, 'unit' | 'tanano'> & { denno: number })[];
  msmember: { mcode: string; sei: string; mei: string | null }[];
  msmadr: ShipAdr[];
  msstaff: { code: string; sei: string; mei: string | null }[];
  mshokuri: { code: string; name: string }[];
  mssystem: ShipSystem[];
}
interface GoodsResult { msgoods: { gcode: string; unit: string | null; tanano: string | null; jan: string | null }[] }

/** 空白（全角・半角）を詰める（現行マクロの Condese_Sp と同じ。フォルダ名に使う） */
const condense = (s: string): string => s.replace(/[\s　]/g, '');
const pad2 = (n: number): string => ('0' + n).slice(-2);

/**
 * 出荷指示: 受注一覧の取得、帳票（納品書・出荷指示書）の作成、NAS の出荷指示フォルダへの保存と受注ステータスの更新。
 * 保存先は現行の「伝票一括処理.xlsm」と同じ  {出荷予定日}出荷分/{担当者}担当分/{伝票番号}_{宛名}様/
 *   {伝票番号}.pdf   納品書（帳票タイプが同梱する のとき）
 *   {伝票番号}_2.pdf 第二帳票（同梱する のとき）
 *   s_{伝票番号}.pdf 出荷指示書
 *   zmemo.txt        倉庫への注意（キープ・印紙・事務所同梱）
 */
@Injectable({
  providedIn: 'root'
})
export class ShipService {
  private usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private okrsrv = inject(OkuriService);
  private nassrv = inject(NasService);
  private spdfsrv = inject(ShipPdfService);
  private apollo = inject(Apollo);

  /** 受注一覧（削除済を除く。出荷予定日・伝票番号の順） */
  async list(f: ShipFilter): Promise<ShipRow[]> {
    const where: Record<string, unknown>[] = [
      { id: { _eq: this.usrsrv.compid } },
      { _or: [{ del: { _is_null: true } }, { del: { _eq: false } }] }
    ];
    if (f.denno) {
      where.push({ denno: { _eq: f.denno } });
    } else {
      where.push({ sday: { _gte: f.from, _lte: f.to } });
      if (f.tcode) {
        where.push({ tcode: { _eq: f.tcode } });
      }
      if (f.jdstatus.length > 0) {
        where.push({ jdstatus: { _in: f.jdstatus } });
      }
    }
    const GetList = gql`
      query get_shiplist($where: trjyuden_bool_exp!) {
        trjyuden(where: $where, order_by: [{sday: asc}, {denno: asc}]) {
          denno mcode ncode nadr buntype sday hday hcode okurisuu okurino tcode jdstatus shipdir ship_at print_at pick_at total denku keep
        }
      }`;
    const { data } = await firstValueFrom(this.apollo.query<{ trjyuden: ShipRow[] }>({
      query: GetList, fetchPolicy: 'network-only', variables: { where: { _and: where } }
    }));
    return (data as { trjyuden: ShipRow[] }).trjyuden.map(e => ({ ...e }));
  }

  /** 帳票を作るためのデータをまとめて読む */
  async load(dennos: number[]): Promise<ShipDoc[]> {
    const id = this.usrsrv.compid;
    // 1 回目: 受注伝票・明細と、件数の少ないマスタ
    const GetDoc = gql`
      query get_shipdoc($id: smallint!, $dnos: [Int!]!) {
        trjyuden(where: {id: {_eq: $id}, denno: {_in: $dnos}}) {
          denno mcode ncode nadr iadr buntype sday uday hcode okurisuu okurino tcode pcode dmemo nmemo keep
          total taxtotal gtotalzn soryozn tesuzn nebikizn total8 total10 denku jdstatus shipdir
        }
        trjyumei(where: {id: {_eq: $id}, denno: {_in: $dnos}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: [{denno: asc}, {line: asc}]) {
          denno line gcode gtext suu touttanka toutmoney taxrate mmemo
        }
        msstaff(where: {id: {_eq: $id}}) { code sei mei }
        mshokuri(where: {id: {_eq: $id}}) { code name }
        mssystem(where: {id: {_eq: $id}}) { kname invno zip adr tel fax }
      }`;
    // 2 回目: 1 回目で分かった顧客（受注先・納品先）と商品だけ
    const GetRef = gql`
      query get_shipref($id: smallint!, $mcds: [String!]!, $gcds: [String!]!) {
        msmember(where: {id: {_eq: $id}, mcode: {_in: $mcds}}) { mcode sei mei }
        msmadr(where: {id: {_eq: $id}, mcode: {_in: $mcds}}) { mcode eda zip region local street extend extend2 adrname }
        msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcds}}) { gcode unit tanano jan }
      }`;
    const [doc] = await Promise.all([
      firstValueFrom(this.apollo.query<Omit<LoadResult, 'msmember' | 'msmadr'>>({
        query: GetDoc, fetchPolicy: 'network-only', variables: { id: id, dnos: dennos }
      })),
      this.bunsrv.qryBunrui()
    ]);
    const d1 = doc.data as Omit<LoadResult, 'msmember' | 'msmadr'>;
    const mcds = [...new Set(d1.trjyuden.flatMap(j => [j.mcode, j.ncode]).filter((e): e is string => !!e))];
    const gcds = [...new Set(d1.trjyumei.map(e => e.gcode).filter(e => !!e))];
    const d2 = (await firstValueFrom(this.apollo.query<Pick<LoadResult, 'msmember' | 'msmadr'> & GoodsResult>({
      query: GetRef, fetchPolicy: 'network-only', variables: { id: id, mcds: mcds, gcds: gcds }
    }))).data as Pick<LoadResult, 'msmember' | 'msmadr'> & GoodsResult;
    const q: LoadResult = { ...d1, msmember: d2.msmember, msmadr: d2.msmadr };
    const goods = d2.msgoods;

    const memberName = (mcode: string | null): string => {
      const m = q.msmember.find(e => e.mcode == mcode);
      return m ? m.sei + (m.mei ?? '') : (mcode ?? '');
    };
    const adr = (mcode: string | null, eda: number | null): ShipAdr | undefined =>
      q.msmadr.find(e => e.mcode == mcode && e.eda == (eda ?? 0));
    const kbn = (kubun: string, value: string | null): string =>
      this.bunsrv.kbn[kubun]?.find(e => e.value == value)?.viewval ?? value ?? '';

    return dennos.map(dno => q.trjyuden.find(e => e.denno == dno)).filter((j): j is JyudenQ => !!j).map(j => {
      // 移行した返品伝票は金額が正で入っているので、帳票ではマイナスにする（現行の帳票と同じ）
      const sign = j.denku == 2 ? -1 : 1;
      const n = (v: number | null) => sign * Number(v ?? 0);
      const staff = q.msstaff.find(e => e.code == j.tcode);
      const nAdr = adr(j.ncode, j.nadr);
      const oAdr = adr(j.mcode, 0);
      return {
        denno: j.denno,
        mcode: j.mcode,
        ncode: j.ncode ?? j.mcode,
        betsuno: (j.ncode ?? j.mcode) != j.mcode || Number(j.nadr ?? 0) > 1,
        orderer: { name: memberName(j.mcode), adr: oAdr },
        nsaki: { name: nAdr?.adrname || memberName(j.ncode ?? j.mcode), adr: nAdr },
        irai: j.iadr != null ? { name: adr(j.mcode, j.iadr)?.adrname || memberName(j.mcode), adr: adr(j.mcode, j.iadr) } : undefined,
        sday: j.sday ?? '',
        uday: j.uday,
        okurino: j.okurino,
        okurisuu: j.okurisuu,
        hcode: j.hcode ?? '',
        hname: q.mshokuri.find(e => e.code == j.hcode)?.name ?? '',
        staffName: staff ? staff.sei + (staff.mei ? '　' + staff.mei : '') : '',
        payName: kbn('pcode', j.pcode),
        keep: j.keep ? kbn('keep', j.keep) : '',
        dmemo: j.dmemo ?? '',
        nmemo: j.nmemo ?? '',
        total: n(j.total),
        taxtotal: n(j.taxtotal),
        zeinuki: n(j.gtotalzn) + n(j.soryozn) + n(j.tesuzn) + n(j.nebikizn),
        total8: n(j.total8),
        total10: n(j.total10),
        lines: q.trjyumei.filter(m => m.denno == j.denno).map(m => {
          const g = goods.find(e => e.gcode == m.gcode);
          return {
            line: m.line, gcode: m.gcode, gtext: m.gtext, suu: sign * Number(m.suu ?? 0),
            touttanka: Number(m.touttanka ?? 0), toutmoney: sign * Number(m.toutmoney ?? 0),
            taxrate: m.taxrate, mmemo: m.mmemo, unit: g?.unit ?? null, tanano: g?.tanano ?? null, jan: g?.jan ?? null
          };
        }),
        system: q.mssystem[0] ?? { kname: null, invno: null, zip: null, adr: null, tel: null, fax: null },
        pickUrl: this.pickUrl(j.denno),
        // 以下は保存処理で使う（ShipDoc の外）
        staffSei: staff?.sei ?? '',
        buntype: j.buntype,
        jdstatus: j.jdstatus
      } as ShipDoc & { staffSei: string; buntype: string | null; jdstatus: string | null };
    });
  }

  /**
   * 出荷指示書の QR コードの URL（スマホのカメラで読むと、ピッキングの画面が開く）。
   * テスト環境で作った出荷指示書には ?db=test を付ける（スマホ側の接続先と違うときに画面で知らせるため）
   */
  pickUrl(denno: number): string {
    return window.location.origin + '/frmship/pick/' + denno + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test');
  }

  /** 受注ステータスを「ピッキング済」にする */
  async setPicked(denno: number): Promise<void> {
    const Upd = gql`
      mutation upd_picked($id: smallint!, $dno: Int!, $set: trjyuden_set_input!) {
        update_trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    await firstValueFrom(this.apollo.mutate({
      mutation: Upd,
      variables: {
        id: this.usrsrv.compid, dno: denno,
        set: { jdstatus: JDST.PICKED, pick_at: new Date(), pick_by: this.usrsrv.staff.code }
      }
    }));
  }

  /** 納品書・出荷指示書の PDF（確認用。保存はしない） */
  async pdfs(dennos: number[]): Promise<{ name: string; blob: Blob }[]> {
    const ret: { name: string; blob: Blob }[] = [];
    for (const d of await this.load(dennos)) {
      const form = denForm((d as ShipDoc & { buntype: string | null }).buntype);
      if (form) {
        ret.push({ name: d.denno + '.pdf', blob: await this.spdfsrv.nohin(d, form) });
        const f2 = typeof form.second == 'number' ? denForm(form.second) : undefined;
        if (f2) {
          ret.push({ name: d.denno + '_2.pdf', blob: await this.spdfsrv.nohin(d, f2) });
        }
      }
      ret.push({ name: 's_' + d.denno + '.pdf', blob: await this.spdfsrv.shiji(d, form) });
    }
    return ret;
  }

  /**
   * 出荷指示フォルダを NAS に作り、受注ステータスを「出荷指示フォルダ作成済」にする。
   * ボタンを押した処理の中で呼ぶこと（最初に NAS への書き込みの許可を求めるため）。
   * 同じ伝票のフォルダが既にあるとき:
   *   ・倉庫で出力済（フォルダ名に【済、またはステータスが出荷指示出力済）、または出荷予定日の前営業日以降 → 「…_差替分」の別フォルダ
   *   ・それ以外 → 同じフォルダに上書き（前の納品書等は消す）
   */
  async saveToNas(dennos: number[], progress?: (done: number, all: number) => void): Promise<ShipResult[]> {
    const root = await this.nassrv.open(NAS_SHIP);
    if (this.okrsrv.hokuri.length == 0) {
      this.okrsrv.getHokuri();
    }
    if (this.okrsrv.haisou.length == 0) {
      this.okrsrv.getHaisou();
    }
    const docs = await this.load(dennos) as (ShipDoc & { staffSei: string; buntype: string | null; jdstatus: string | null })[];
    const results: ShipResult[] = [];
    let done = 0;
    for (const d of docs) {
      const r: ShipResult = { denno: d.denno, dir: '', sasikae: false, error: '' };
      try {
        const form = denForm(d.buntype);
        if (!form) {
          throw new Error('納品書タイプが未設定です');
        }
        if (!d.sday) {
          throw new Error('出荷予定日が未入力です');
        }
        if (!d.staffSei) {
          throw new Error('担当者が未設定です');
        }
        // 送り状番号を採番する配送（佐川など）で未採番なら、ここで採番する
        if (!d.okurino && this.okrsrv.getHinfo(d.hcode).numbering) {
          d.okurino = await this.okrsrv.setOkurino(d.hcode);
          await this.setOkurino(d.denno, d.okurino);
        }
        const parentPath = d.sday.replace(/-/g, '') + '出荷分/' + d.staffSei + '担当分';
        const parent = await this.nassrv.folder(root, parentPath);
        const base = d.denno + '_' + this.nassrv.safeName(condense((d.betsuno ? d.nsaki.name : d.orderer.name) + '様'));
        const exists = (await this.nassrv.names(parent, 'directory')).filter(e => e.startsWith(d.denno + '_'));
        let name = base;
        if (exists.length > 0) {
          const printed = exists.some(e => e.includes('【済')) || d.jdstatus == JDST.PRINTED || d.jdstatus == JDST.PICKED;
          const near = this.usrsrv.formatDate(new Date()) >= this.usrsrv.formatDate(this.usrsrv.getPrevday(this.toDate(d.sday)));
          if (printed || near) {
            const now = new Date();
            name = base + pad2(now.getMonth() + 1) + pad2(now.getDate()) + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) + '_差替分';
            r.sasikae = true;
          } else {
            name = exists[exists.length - 1];
          }
        }
        const dir = await this.nassrv.folder(parent, name);
        if (!r.sasikae) {
          for (const old of [d.denno + '.pdf', d.denno + '_2.pdf', 's_' + d.denno + '.pdf', 'zmemo.txt']) {
            await this.nassrv.remove(dir, old);
          }
        }
        if (form.dokon == 'する') {
          await this.nassrv.write(dir, d.denno + '.pdf', await this.spdfsrv.nohin(d, form));
        }
        const f2 = typeof form.second == 'number' ? denForm(form.second) : undefined;
        if (f2?.dokon == 'する') {
          await this.nassrv.write(dir, d.denno + '_2.pdf', await this.spdfsrv.nohin(d, f2));
        }
        await this.nassrv.write(dir, 's_' + d.denno + '.pdf', await this.spdfsrv.shiji(d, form));
        const memo = this.zmemo(d, form.code);
        if (memo.length > 0) {
          await this.nassrv.write(dir, 'zmemo.txt', await this.sjis(memo.join('\r\n') + '\r\n'));
        }
        r.dir = parentPath + '/' + name;
        await this.setShipped(d.denno, r.dir);
      } catch (e) {
        r.error = (e as Error).message;
        console.log('error saveToNas', d.denno, e);
      }
      results.push(r);
      progress?.(++done, docs.length);
    }
    return results;
  }

  /** zmemo.txt（倉庫への注意）の行 */
  private zmemo(d: ShipDoc, formCode: number): string[] {
    const ret: string[] = [];
    if (d.keep && d.keep != 'カード案内同梱') {
      ret.push(d.keep);
    }
    if (formCode == 3 && d.zeinuki >= 50000) {
      ret.push('領収書に印紙が必要！！');
    }
    if (d.lines.some(l => shipNote(l.gcode ?? '', l.gtext ?? '', d.mcode).jimu)) {
      ret.push('事務所より同梱商品あり！！');
    }
    return ret;
  }

  /** 倉庫のツールが読めるように Shift_JIS にする */
  private async sjis(text: string): Promise<Blob> {
    const mod = await import('encoding-japanese');
    const Encoding = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const codes = Encoding.convert(Encoding.stringToCode(text), { to: 'SJIS', from: 'UNICODE' });
    return new Blob([new Uint8Array(codes)], { type: 'text/plain' });
  }

  private toDate(day: string): Date {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private async setOkurino(denno: number, okurino: string): Promise<void> {
    const Upd = gql`
      mutation upd_shipokuri($id: smallint!, $dno: Int!, $okr: String!) {
        update_trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: {okurino: $okr}) { affected_rows }
      }`;
    await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { id: this.usrsrv.compid, dno: denno, okr: okurino } }));
  }

  /** 受注ステータスを「出荷指示フォルダ作成済」にする */
  private async setShipped(denno: number, dir: string): Promise<void> {
    const Upd = gql`
      mutation upd_shipped($id: smallint!, $dno: Int!, $set: trjyuden_set_input!) {
        update_trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    await firstValueFrom(this.apollo.mutate({
      mutation: Upd,
      variables: {
        id: this.usrsrv.compid, dno: denno,
        set: { jdstatus: JDST.FOLDER, shipdir: dir, ship_at: new Date(), ship_by: this.usrsrv.staff.code }
      }
    }));
  }

  /**
   * 受注ステータスを「出荷指示出力済」にする（倉庫で印刷したとき）。
   * 出荷指示フォルダ作成済の伝票だけ（フォルダ作成後に受注伝票を直した＝受注登録に戻った伝票は、古いフォルダなので変えない）。
   * 更新した伝票番号を返す
   */
  async setPrinted(dennos: number[]): Promise<number[]> {
    const Upd = gql`
      mutation upd_printed($id: smallint!, $dnos: [Int!]!, $sts: [String!]!, $set: trjyuden_set_input!) {
        update_trjyuden(where: {id: {_eq: $id}, denno: {_in: $dnos}, jdstatus: {_in: $sts}}, _set: $set) {
          returning { denno }
        }
      }`;
    const { data } = await firstValueFrom(this.apollo.mutate<{ update_trjyuden: { returning: { denno: number }[] } }>({
      mutation: Upd,
      variables: {
        id: this.usrsrv.compid, dnos: dennos, sts: [JDST.FOLDER, JDST.PRINTED],
        set: { jdstatus: JDST.PRINTED, print_at: new Date(), print_by: this.usrsrv.staff.code }
      }
    }));
    return (data?.update_trjyuden.returning ?? []).map(e => e.denno);
  }
}
