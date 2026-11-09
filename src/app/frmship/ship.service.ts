import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { OkuriService } from './../services/okuri.service';
import { NasService } from './../services/nas.service';
import { NAS_SHIP, NAS_FAX, LOCAL_HIKAE, LOCAL_OKURICSV } from './../share/nasfolder/nasfolder.component';
import { ShipPdfService, ShipAdr, ShipDoc, ShipLine, ShipSystem } from './ship-pdf.service';
import { JDST, BuntypeRow, BunshoRow, DenForm, buildForms, findForm, isKeepStage, shipNote } from './ship-forms';
import { HCODE_DOKON, isAmazon } from './../share/amazon';
import {
  CSV_KINDS, CSVIMP_FOLDER, CSVIMP_HONSHA, CsvDoc, CsvKind, HktimeCsv, HokuriCsv,
  csvKind, csvLine, folderCsvName, isOfficeCsv, officeCsvDenno, officeCsvName
} from './ship-csv';

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
  /** 出荷日（から・まで。yyyy-mm-dd） */
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
  /** e飛伝Ⅱ・CLOUD の送り状 CSV の行（事務の PC に保存する） */
  csv?: { kind: CsvKind; sday: string; line: string };
}

/** 出荷指示フォルダの保存の結果 */
export interface ShipSave {
  results: ShipResult[];
  /** 納品書控・送り状 CSV の保存で気をつけること */
  notes: string[];
  /** 送り状CSVフォルダに保存したファイル */
  csvSaved: string[];
  /** 送り状CSVフォルダが無い（または保存できなかった）ので、ダウンロードするファイル */
  downloads: { name: string; blob: Blob }[];
}

interface JyudenQ {
  denno: number; mcode: string; ncode: string | null; nadr: number | null; iadr: number | null; buntype: string | null;
  day?: string | null; yday: string | null; sday: string | null; uday: string | null; hcode: string | null; okurisuu: number | null; okurino: string | null;
  tcode: string | null; pcode: string | null; dmemo: string | null; nmemo: string | null; keep: string | null; cusden: string | null;
  total: number | null; taxtotal: number | null; gtotalzn: number | null; soryozn: number | null; tesuzn: number | null; nebikizn: number | null;
  total8: number | null; total10: number | null; denku: number | null; jdstatus: string | null; shipdir: string | null;
  hday: string | null; htime: string | number | null; omemo: string | null; daibiki: number | null; daibzei: number | null;
  eidome: string | boolean | null; eicode: string | null;
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
 * Amazon の同梱（現行の伝票一括処理.xlsm と同じ）: 一緒に出荷指示フォルダを作る Amazon の伝票のうち、
 * 出荷日・納品先（顧客と住所の枝番）が同じものは 1 つの荷物にまとめる。伝票番号の一番小さい伝票を親とし、
 * ほかの伝票（子）→ 親の伝票番号 の対応を返す
 */
export function amazonDokon(docs: { denno: number; mcode: string; ncode: string; sday: string; nsaki: { adr?: { eda: number } } }[]): Map<number, number> {
  const groups = new Map<string, number[]>();
  for (const d of docs) {
    if (!isAmazon(d.mcode) || !d.sday || !d.nsaki.adr) {
      continue;
    }
    const key = d.sday + '|' + d.ncode + '|' + d.nsaki.adr.eda;
    groups.set(key, [...(groups.get(key) ?? []), d.denno]);
  }
  const ret = new Map<number, number>();
  for (const dnos of groups.values()) {
    const sorted = [...dnos].sort((a, b) => a - b);
    sorted.slice(1).forEach(c => ret.set(c, sorted[0]));
  }
  return ret;
}

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
          denno mcode ncode nadr iadr buntype day yday sday uday hcode okurisuu okurino tcode pcode dmemo nmemo keep cusden
          total taxtotal gtotalzn soryozn tesuzn nebikizn total8 total10 denku jdstatus shipdir
          hday htime omemo daibiki daibzei eidome eicode
        }
        trjyumei(where: {id: {_eq: $id}, denno: {_in: $dnos}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: [{denno: asc}, {line: asc}]) {
          denno line gcode gtext suu touttanka toutmoney tinmoney taxrate mmemo spec scode
        }
        msstaff(where: {id: {_eq: $id}}) { code sei mei }
        mshokuri(where: {id: {_eq: $id}}) { code name }
        mssystem(where: {id: {_eq: $id}}) { kname invno zip adr tel fax }
      }`;
    // 2 回目: 1 回目で分かった顧客（受注先・納品先）と商品だけ
    const GetRef = gql`
      query get_shipref($id: smallint!, $mcds: [String!]!, $gcds: [String!]!) {
        msmember(where: {id: {_eq: $id}, mcode: {_in: $mcds}}) { mcode sei mei }
        msmadr(where: {id: {_eq: $id}, mcode: {_in: $mcds}}) { mcode eda zip region local street extend extend2 adrname tel }
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
        // Amazon は納品先が必ず倉庫（センター）なので、フォルダ名・出荷指示書の納入先に倉庫の名前を出す
        betsuno: (j.ncode ?? j.mcode) != j.mcode || Number(j.nadr ?? 0) > 1 || isAmazon(j.mcode),
        orderer: { name: memberName(j.mcode), adr: oAdr },
        nsaki: { name: nAdr?.adrname || memberName(j.ncode ?? j.mcode), adr: nAdr },
        irai: j.iadr != null ? { name: adr(j.mcode, j.iadr)?.adrname || memberName(j.mcode), adr: adr(j.mcode, j.iadr) } : undefined,
        sday: j.sday ?? '',
        yday: j.yday,
        day: j.day ?? null,
        gtotal: n(j.gtotalzn),
        tcode: j.tcode,
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
            touttanka: Number(m.touttanka ?? 0), toutmoney: sign * Number(m.toutmoney ?? 0), tinmoney: sign * Number(m.tinmoney ?? 0),
            taxrate: m.taxrate, mmemo: m.mmemo, unit: g?.unit ?? null, tanano: g?.tanano ?? null, jan: g?.jan ?? null,
            spec: m.spec ?? null, scode: m.scode ?? null
          };
        }),
        system: q.mssystem[0] ?? { kname: null, invno: null, zip: null, adr: null, tel: null, fax: null },
        pickUrl: this.pickUrl(j.denno),
        cusden: j.cusden,
        okuri: {
          hday: j.hday, htime: j.htime == null ? null : String(j.htime), omemo: j.omemo, daibiki: j.daibiki, daibzei: j.daibzei,
          eidome: j.eidome, eicode: j.eicode
        },
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

  /** キープ表の QR コードの URL（スマホのカメラで読むと、キープ確認の画面が開く） */
  keepUrl(denno: number): string {
    return window.location.origin + '/frmship/keep/' + denno + (localStorage.getItem('MWSYS_DB') == null ? '' : '?db=test');
  }

  /**
   * キープ表を NAS の倉庫宛 FAX フォルダ（{担当者}/{伝票番号}キープ表.pdf）に保存し、受注ステータスを「キープ表FAX済」にする。
   * 載せた明細を trkeep に写しておく（倉庫で確保できた数を記録し、後の変更を見分けるため）。
   * ボタンを押した処理の中で呼ぶこと（最初に NAS への書き込みの許可を求めるため）。保存したファイル（相対パス）を返す
   */
  async keepFax(denno: number, label = 'キープ表', make?: (d: ShipDoc, url: string) => Promise<Blob>): Promise<string> {
    const root = await this.nassrv.open(NAS_FAX);
    const d = (await this.load([denno]) as (ShipDoc & { staffSei: string })[])[0];
    if (!d) {
      throw new Error('受注伝票 ' + denno + ' が見つかりません');
    }
    if (!d.staffSei) {
      throw new Error('担当者が未設定です');
    }
    const dir = await this.nassrv.folder(root, d.staffSei);
    const name = d.denno + this.nassrv.safeName(label) + '.pdf';
    const url = this.keepUrl(d.denno);
    await this.nassrv.write(dir, name, await (make ? make(d, url) : this.spdfsrv.keep(d, url)));
    const now = new Date();
    const by = this.usrsrv.staff.code;
    const Upd = gql`
      mutation upd_keepfax($id: smallint!, $dno: Int!, $objs: [trkeep_insert_input!]!, $set: trjyuden_set_input!) {
        delete_trkeep(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { affected_rows }
        insert_trkeep(objects: $objs) { affected_rows }
        update_trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    await firstValueFrom(this.apollo.mutate({
      mutation: Upd,
      variables: {
        id: this.usrsrv.compid, dno: denno,
        objs: d.lines.map(l => ({
          id: this.usrsrv.compid, denno: denno, line: l.line, gcode: l.gcode, gtext: l.gtext, suu: l.suu,
          scode: l.scode ?? null, spec: l.spec ?? null, faxed_at: now, faxed_by: by
        })),
        set: { jdstatus: JDST.KEEP_FAX, keep_at: now, keep_by: by }
      }
    }));
    return d.staffSei + '/' + name;
  }

  /**
   * 帳票（受注伝票の帳票メニューで作った PDF）を NAS の倉庫宛 FAX フォルダ（{担当者}/{伝票番号}{帳票名}.pdf）に保存する。
   * 受注ステータスは変えない。ボタンを押した処理の中で呼ぶこと。保存したファイル（相対パス）を返す
   */
  async faxPdf(denno: number, label: string, make: (d: ShipDoc) => Promise<Blob>): Promise<string> {
    const root = await this.nassrv.open(NAS_FAX);
    const d = (await this.load([denno]) as (ShipDoc & { staffSei: string })[])[0];
    if (!d) {
      throw new Error('受注伝票 ' + denno + ' が見つかりません');
    }
    if (!d.staffSei) {
      throw new Error('担当者が未設定です');
    }
    const dir = await this.nassrv.folder(root, d.staffSei);
    const name = d.denno + this.nassrv.safeName(label) + '.pdf';
    await this.nassrv.write(dir, name, await make(d));
    return d.staffSei + '/' + name;
  }

  /**
   * 倉庫で確かめたキープの結果（明細ごとに確保できた数）を記録し、受注ステータスを
   * 「キープ確認済」（すべて確保できた）または「欠品」にする
   */
  async setKeepChecked(d: ShipDoc, kpsuu: { line: number; kpsuu: number }[], short: boolean): Promise<void> {
    const now = new Date();
    const by = this.usrsrv.staff.code;
    const Upd = gql`
      mutation upd_keepchk($id: smallint!, $dno: Int!, $objs: [trkeep_insert_input!]!, $set: trjyuden_set_input!) {
        insert_trkeep(objects: $objs, on_conflict: {constraint: trkeep_pkey, update_columns: [kpsuu, checked_at, checked_by]}) { affected_rows }
        update_trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    await firstValueFrom(this.apollo.mutate({
      mutation: Upd,
      variables: {
        id: this.usrsrv.compid, dno: d.denno,
        objs: d.lines.map(l => ({
          id: this.usrsrv.compid, denno: d.denno, line: l.line, gcode: l.gcode, gtext: l.gtext, suu: l.suu,
          scode: l.scode ?? null, spec: l.spec ?? null,
          kpsuu: kpsuu.find(k => k.line == l.line)?.kpsuu ?? null, checked_at: now, checked_by: by
        })),
        set: { jdstatus: short ? JDST.KEEP_SHORT : JDST.KEEP_OK, kpchk_at: now, kpchk_by: by }
      }
    }));
  }

  /** キープ表で確保できた数（明細ごと）。未確認・キープ表なしは空 */
  async keepResult(denno: number): Promise<{ line: number; gcode: string; suu: number; kpsuu: number | null }[]> {
    const Get = gql`
      query get_keep($id: smallint!, $dno: Int!) {
        trkeep(where: {id: {_eq: $id}, denno: {_eq: $dno}}, order_by: {line: asc}) { line gcode suu kpsuu }
      }`;
    const { data } = await firstValueFrom(this.apollo.query<{ trkeep: { line: number; gcode: string; suu: number; kpsuu: number | null }[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: denno }
    }));
    return data?.trkeep ?? [];
  }

  /**
   * 受注伝票を保存し直したときの受注ステータス。
   *   ・キープ表の段階（FAX 済〜欠品）: 明細の追加・削除や数量の増減（商品ごとの数の違い）があれば「キープ表FAX後の変更」、無ければそのまま
   *   ・それ以外（出荷指示フォルダ作成後など）: 受注登録に戻す（出荷指示の作り直しの対象）
   */
  async statusOnSave(denno: number, current: string | null, lines: { gcode: string; suu: number }[]): Promise<string> {
    if (!isKeepStage(current)) {
      return JDST.TOROKU;
    }
    if (current == JDST.KEEP_CHANGED) {
      return current;
    }
    const sum = (ls: { gcode: string; suu: number }[]) => {
      const m = new Map<string, number>();
      ls.filter(e => e.gcode).forEach(e => m.set(e.gcode, (m.get(e.gcode) ?? 0) + Number(e.suu ?? 0)));
      return m;
    };
    const before = sum(await this.keepResult(denno));
    const after = sum(lines);
    const same = before.size == after.size && [...after].every(([g, s]) => before.get(g) == s);
    return same ? current! : JDST.KEEP_CHANGED;
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
    const forms = await this.loadForms();
    for (const d of await this.load(dennos)) {
      const form = findForm(forms, (d as ShipDoc & { buntype: string | null }).buntype);
      if (isAmazon(d.mcode) || form?.amazon) {
        ret.push({ name: d.denno + '.pdf', blob: await this.spdfsrv.amazon(d) });
        ret.push({ name: 's_' + d.denno + '.pdf', blob: await this.spdfsrv.shiji(d, undefined) });
        continue;
      }
      if (form) {
        ret.push({ name: d.denno + '.pdf', blob: await this.spdfsrv.nohin(d, form) });
        if (form.second) {
          ret.push({ name: d.denno + '_2.pdf', blob: await this.spdfsrv.nohin(d, form.second) });
        }
      }
      ret.push({ name: 's_' + d.denno + '.pdf', blob: await this.spdfsrv.shiji(d, form) });
    }
    return ret;
  }

  private forms?: Promise<DenForm[]>;

  /** 帳票タイプの様式（納品書タイプマスタ・文書マスタ）。一度読んだら使い回す（読めなかったときは次に読み直す） */
  loadForms(): Promise<DenForm[]> {
    if (!this.forms) {
      const Get = gql`
        query get_shipforms($id: smallint!) {
          msbuntype(where: {id: {_eq: $id}}) { code name first saki second sksec }
          msbunsho(where: {id: {_eq: $id}}) { code name title gakutxt stamp atesaki message hmoto }
        }`;
      this.forms = firstValueFrom(this.apollo.query<{ msbuntype: BuntypeRow[]; msbunsho: BunshoRow[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid }
      })).then(res => {
        if (res.error || !res.data) {
          throw new Error('納品書タイプマスタ・文書マスタを読めませんでした');
        }
        return buildForms(res.data.msbuntype, res.data.msbunsho);
      });
      this.forms.catch(() => this.forms = undefined);
    }
    return this.forms;
  }

  /** この PC のフォルダ（送り状CSV・納品書控）。設定していなければ undefined。許可されなかったときは notes に書いて undefined */
  private async openLocal(key: string, notes: string[]): Promise<FileSystemDirectoryHandle | undefined> {
    if (!this.nassrv.supported || !(await this.nassrv.get(key))) {
      return undefined;
    }
    try {
      return await this.nassrv.open(key);
    } catch (e) {
      notes.push((e as Error).message);
      return undefined;
    }
  }

  /**
   * 出荷指示フォルダを NAS に作り、受注ステータスを「出荷指示フォルダ作成済」にする。
   * ボタンを押した処理の中で呼ぶこと（最初に NAS への書き込みの許可を求めるため）。
   * 同じ伝票のフォルダが既にあるとき:
   *   ・倉庫で出力済（フォルダ名に【済、またはステータスが出荷指示出力済）、または出荷予定日の前営業日以降 → 「…_差替分」の別フォルダ
   *   ・それ以外 → 同じフォルダに上書き（前の納品書等は消す）
   */
  async saveToNas(dennos: number[], progress?: (done: number, all: number) => void): Promise<ShipSave> {
    const root = await this.nassrv.open(NAS_SHIP);
    // この PC のフォルダの許可も、ボタンを押した直後のうちに求める
    const notes: string[] = [];
    const csvDir = await this.openLocal(LOCAL_OKURICSV, notes);
    const hikaeDir = await this.openLocal(LOCAL_HIKAE, notes);
    const forms = await this.loadForms();
    if (this.okrsrv.hokuri.length == 0) {
      this.okrsrv.getHokuri();
    }
    if (this.okrsrv.haisou.length == 0) {
      this.okrsrv.getHaisou();
    }
    const loaded = await this.load(dennos) as (ShipDoc & { staffSei: string; buntype: string | null; jdstatus: string | null })[];
    // Amazon の同梱: まとめる側（親）を先に保存し、その送り状番号をまとめられる側（子）に使う
    const parentOf = amazonDokon(loaded);
    const docs = [...loaded.filter(d => !parentOf.has(d.denno)), ...loaded.filter(d => parentOf.has(d.denno))];
    const saved = new Map<number, ShipDoc>();
    const masters = await this.csvMasters();
    const today = this.usrsrv.formatDate(new Date());
    const results: ShipResult[] = [];
    let done = 0;
    for (const d of docs) {
      const r: ShipResult = { denno: d.denno, dir: '', sasikae: false, error: '' };
      try {
        const form = findForm(forms, d.buntype);
        const amazon = isAmazon(d.mcode) || !!form?.amazon;
        if (!form && !amazon) {
          throw new Error('納品書タイプが未設定です');
        }
        if (!d.sday) {
          throw new Error('出荷日が未入力です');
        }
        if (!d.staffSei) {
          throw new Error('担当者が未設定です');
        }
        const children = [...parentOf].filter(([, p]) => p == d.denno).map(([c]) => c);
        const parentNo = parentOf.get(d.denno);
        if (parentNo != null) {
          // 同梱される側: 配送を「同梱」にし、送り状番号は親と同じにする
          const parent = saved.get(parentNo);
          if (!parent) {
            throw new Error('同梱先の伝票 ' + parentNo + ' を保存できなかったため、保存しませんでした');
          }
          d.hcode = HCODE_DOKON;
          d.hname = '同梱';
          d.okurino = parent.okurino;
          d.dokon = '伝票 ' + parentNo + ' に同梱（送り状は伝票 ' + parentNo + ' と共通）';
          await this.setOkurino(d.denno, d.okurino ?? '', HCODE_DOKON);
        } else if (!d.okurino && this.okrsrv.getHinfo(d.hcode).numbering) {
          // 送り状番号を採番する配送（佐川など）で未採番なら、ここで採番する（Amazon は過去に使った番号を飛ばす）
          d.okurino = await this.okrsrv.nextOkurino(d.hcode, d.mcode, d.denno);
          await this.setOkurino(d.denno, d.okurino);
        }
        if (children.length > 0) {
          d.dokon = '伝票 ' + children.join('・') + ' を同梱';
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
          for (const old of [d.denno + '.pdf', d.denno + '_2.pdf', 's_' + d.denno + '.pdf', 'zmemo.txt',
            ...CSV_KINDS.map(k => folderCsvName(k, d.denno))]) {
            await this.nassrv.remove(dir, old);
          }
        }
        // 納品書（第一・第二帳票）。同梱する（shuk）ものだけ出荷指示フォルダに入れ、控えにはすべて保存する（現行と同じ）
        const nohin1 = amazon ? await this.spdfsrv.amazon(d) : form ? await this.spdfsrv.nohin(d, form) : undefined;
        const nohin2 = !amazon && form?.second ? await this.spdfsrv.nohin(d, form.second) : undefined;
        if (nohin1 && (amazon || form?.dokon == 'する')) {
          await this.nassrv.write(dir, d.denno + '.pdf', nohin1);
        }
        if (nohin2 && form?.second?.dokon == 'する') {
          await this.nassrv.write(dir, d.denno + '_2.pdf', nohin2);
        }
        await this.nassrv.write(dir, 's_' + d.denno + '.pdf', await this.spdfsrv.shiji(d, amazon ? undefined : form));
        const memo = this.zmemo(d, form?.code ?? 0);
        // 送り状 CSV（配送方法マスタのタイプ・CSV 取込場で、伝票ごとのファイルか本社の日ごとのファイル）
        const hk = masters.hokuri.find(e => e.code == d.hcode);
        const kind = csvKind(hk);
        if (hk && kind) {
          const imp = (hk.csvimp ?? '').trim();
          if (imp == CSVIMP_FOLDER || imp == CSVIMP_HONSHA) {
            const line = csvLine(kind, this.csvDoc(d), hk, masters.hktime, today);
            if (isOfficeCsv(kind)) {
              // e飛伝Ⅱ・CLOUD は出荷指示フォルダに入れず、事務の PC に保存して取り込む
              r.csv = { kind, sday: d.sday, line };
            } else if (imp == CSVIMP_FOLDER) {
              await this.nassrv.write(dir, folderCsvName(kind, d.denno), await this.sjis(line + '\r\n'));
            }
          }
          if (kind == 'e飛伝Ⅱ' && (hk.mtchaku ?? '').trim() == '2') {
            memo.push('e飛伝Ⅱ着払い！！（発送当日に送り状出力 取扱注意シール必要）');
          } else if (kind == 'CLOUD') {
            memo.push('Biz-Logi Cloud！！');
          }
        } else if ((hk?.htype ?? '').trim() == '複写式') {
          memo.push(d.hname + '！！');
        }
        if (memo.length > 0) {
          await this.nassrv.write(dir, 'zmemo.txt', await this.sjis(memo.join('\r\n') + '\r\n'));
        }
        r.dir = parentPath + '/' + name;
        await this.setShipped(d.denno, r.dir);
        saved.set(d.denno, d);
        // 納品書の控え（この PC の納品書控\{yyyymmdd}出荷日\{伝票番号}{受注先}.pdf・_2.pdf）
        if (hikaeDir && nohin1) {
          try {
            const hdir = await this.nassrv.folder(hikaeDir, d.sday.replace(/-/g, '') + '出荷日');
            const hname = d.denno + this.nassrv.safeName(condense(d.orderer.name));
            await this.nassrv.write(hdir, hname + '.pdf', nohin1);
            if (nohin2) {
              await this.nassrv.write(hdir, hname + '_2.pdf', nohin2);
            }
          } catch (e) {
            notes.push('伝票 ' + d.denno + ' の納品書控を保存できませんでした：' + (e as Error).message);
          }
        }
      } catch (e) {
        r.error = (e as Error).message;
        console.log('error saveToNas', d.denno, e);
      }
      results.push(r);
      progress?.(++done, docs.length);
    }
    results.sort((a, b) => dennos.indexOf(a.denno) - dennos.indexOf(b.denno));
    const csv = await this.saveOfficeCsv(results, csvDir, notes);
    return { results, notes, ...csv };
  }

  /**
   * 移動伝票の出荷指示フォルダを NAS に作る（現行の伝票一括処理.xlsm の移動伝票と同じ）。
   * 保存先は受注伝票と同じ {移動日}出荷分/{担当者}担当分/{伝票番号}_{送り先}様/ に、出荷指示書（s_{伝票番号}.pdf）と送り状 CSV。
   *  - 送り先は移動伝票の送り先（大会倉庫など。入っていれば）、無ければ入庫倉庫の倉庫マスタの住所
   *  - 納品書は作らない。佐川（PCCS）・iSⅡ の CSV は「_ido」を付けた名前にする（倉庫の印刷で自動で出ないように。現行と同じ）
   *  - 送り状番号を採番する配送で未採番なら採番して移動伝票に書く
   * ボタンを押した処理の中で呼ぶこと（最初に NAS への書き込みの許可を求めるため）
   */
  async saveMoveToNas(denno: number): Promise<ShipSave> {
    const root = await this.nassrv.open(NAS_SHIP);
    const notes: string[] = [];
    const csvDir = await this.openLocal(LOCAL_OKURICSV, notes);
    if (this.okrsrv.hokuri.length == 0) {
      this.okrsrv.getHokuri();
    }
    if (this.okrsrv.haisou.length == 0) {
      this.okrsrv.getHaisou();
    }
    const id = this.usrsrv.compid;
    const Get = gql`
      query get_shipmove($id: smallint!, $dno: Int!) {
        trmovsub_by_pk(id: $id, denno: $dno) {
          denno day incode outcode tcode hcode hday htime okurino okurisuu dmemo omemo smemo szip sadr sname stel
          trmovdens(order_by: {line: asc}) { line gcode suu memo msgood { gtext unit tanano jan } }
        }
        msstaff(where: {id: {_eq: $id}}) { code sei mei }
        mshokuri(where: {id: {_eq: $id}}) { code name }
        mssystem(where: {id: {_eq: $id}}) { kname invno zip adr tel fax }
        msstore(where: {id: {_eq: $id}}) { code name subname zip region local street extend tel }
      }`;
    type MoveQ = {
      trmovsub_by_pk: {
        denno: number; day: string | null; incode: string; outcode: string; tcode: string | null; hcode: string | number | null;
        hday: string | null; htime: string | number | null; okurino: string | number | null; okurisuu: number | null;
        dmemo: string | null; omemo: string | null; smemo: string | null;
        szip: string | null; sadr: string | null; sname: string | null; stel: string | null;
        trmovdens: { line: number; gcode: string; suu: number; memo: string | null; msgood: { gtext: string | null; unit: string | null; tanano: string | null; jan: string | null } | null }[];
      } | null;
      msstaff: { code: string; sei: string; mei: string | null }[];
      mshokuri: { code: string; name: string }[];
      mssystem: ShipSystem[];
      msstore: { code: string; name: string | null; subname: string | null; zip: string | null; region: string | null; local: string | null; street: string | null; extend: string | null; tel: string | null }[];
    };
    const res = await firstValueFrom(this.apollo.query<MoveQ>({ query: Get, fetchPolicy: 'network-only', variables: { id, dno: denno } }));
    if (res.error || !res.data) {
      throw new Error('移動伝票を読めませんでした：' + (res.error?.message ?? ''));
    }
    const q = res.data;
    const m = q.trmovsub_by_pk;
    if (!m) {
      throw new Error('移動伝票 ' + denno + ' がありません');
    }
    if (!m.day) {
      throw new Error('移動日が未入力です');
    }
    // 移動伝票の配送方法は数値の列（送り状マスタのコードは文字）なので、文字にしてから比べる
    const hcode = String(m.hcode ?? '').trim();
    if (!hcode) {
      throw new Error('配送方法が未入力です');
    }
    const staff = q.msstaff.find(e => e.code == m.tcode);
    if (!staff?.sei) {
      throw new Error('担当者が未設定です');
    }
    const store = (code: string) => q.msstore.find(e => e.code == code);
    const sin = store(m.incode);
    const sout = store(m.outcode);
    // 送り先: 移動伝票の送り先があればそれ、無ければ入庫倉庫の住所
    const own = !!(m.sadr ?? '').trim();
    const toAdr: ShipAdr = own
      ? { mcode: '', eda: 0, zip: m.szip, region: null, local: null, street: m.sadr, extend: null, extend2: null, adrname: m.sname, tel: m.stel }
      : { mcode: '', eda: 0, zip: sin?.zip ?? null, region: sin?.region ?? null, local: sin?.local ?? null, street: sin?.street ?? null,
        extend: sin?.extend ?? null, extend2: null, adrname: sin?.name ?? null, tel: sin?.tel ?? null };
    const toName = (own ? m.sname : sin?.name) || sin?.subname || m.incode;
    if (!toAdr.street && !toAdr.local) {
      throw new Error('送り先の住所がありません（移動伝票の送り先か、倉庫マスタの入庫倉庫 ' + m.incode + ' の住所を入れてください）');
    }
    const d: ShipDoc = {
      denno: m.denno, mcode: '', ncode: '', betsuno: true,
      orderer: { name: sout?.name ?? m.outcode },
      nsaki: { name: toName, adr: toAdr },
      sday: m.day, yday: m.day, uday: null,
      okurino: m.okurino == null ? null : String(m.okurino), okurisuu: m.okurisuu,
      hcode, hname: q.mshokuri.find(e => e.code == hcode)?.name ?? '',
      staffName: staff.sei + (staff.mei ? '　' + staff.mei : ''), payName: '', keep: '',
      dmemo: ['移動伝票（' + (sout?.subname ?? m.outcode) + ' → ' + (sin?.subname ?? m.incode) + '）', m.dmemo ?? ''].filter(e => e).join(' '),
      nmemo: m.smemo ?? '',
      total: 0, taxtotal: 0, zeinuki: 0, total8: 0, total10: 0,
      lines: m.trmovdens.map(l => ({
        line: l.line, gcode: l.gcode, gtext: l.msgood?.gtext ?? '', suu: Number(l.suu ?? 0), touttanka: 0, toutmoney: 0,
        taxrate: null, mmemo: l.memo, unit: l.msgood?.unit ?? null, tanano: l.msgood?.tanano ?? null, jan: l.msgood?.jan ?? null,
        scode: m.outcode
      })),
      system: q.mssystem[0] ?? { kname: null, invno: null, zip: null, adr: null, tel: null, fax: null },
      okuri: { hday: m.hday, htime: m.htime == null ? null : String(m.htime), omemo: m.omemo, daibiki: null, daibzei: null, eidome: null, eicode: null }
    };
    // 送り状番号を採番する配送（佐川など）で未採番なら、ここで採番して移動伝票に書く
    if (!d.okurino && this.okrsrv.getHinfo(hcode).numbering) {
      d.okurino = await this.okrsrv.nextOkurino(hcode, null, denno);
      const Upd = gql`
        mutation upd_moveokuri($id: smallint!, $dno: Int!, $set: trmovsub_set_input!) {
          update_trmovsub(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
        }`;
      const u = await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { id, dno: denno, set: { okurino: d.okurino } } }));
      if (u.error) {
        throw new Error('送り状番号を保存できませんでした：' + u.error.message);
      }
    }
    const r: ShipResult = { denno, dir: '', sasikae: false, error: '' };
    const parentPath = m.day.replace(/-/g, '') + '出荷分/' + staff.sei + '担当分';
    const parent = await this.nassrv.folder(root, parentPath);
    const base = denno + '_' + this.nassrv.safeName(condense(toName + '様'));
    const exists = (await this.nassrv.names(parent, 'directory')).filter(e => e.startsWith(denno + '_'));
    let name = base;
    if (exists.length > 0) {
      // 倉庫で出力済（【済）なら差し替えの別フォルダ、それ以外は同じフォルダに上書き
      if (exists.some(e => e.includes('【済'))) {
        const now = new Date();
        name = base + pad2(now.getMonth() + 1) + pad2(now.getDate()) + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) + '_差替分';
        r.sasikae = true;
      } else {
        name = exists[exists.length - 1];
      }
    }
    const dir = await this.nassrv.folder(parent, name);
    const moveCsv = (kind: CsvKind) => folderCsvName(kind, denno).replace(/(pccs|iS2)\.csv$/, '$1_ido.csv');
    if (!r.sasikae) {
      for (const old of ['s_' + denno + '.pdf', 'zmemo.txt', ...CSV_KINDS.map(k => moveCsv(k))]) {
        await this.nassrv.remove(dir, old);
      }
    }
    await this.nassrv.write(dir, 's_' + denno + '.pdf', await this.spdfsrv.shiji(d, undefined));
    const memo: string[] = ['移動伝票（' + (sout?.subname ?? m.outcode) + ' → ' + (sin?.subname ?? m.incode) + '）'];
    const masters = await this.csvMasters();
    const hk = masters.hokuri.find(e => e.code == hcode);
    const kind = csvKind(hk);
    if (hk && kind) {
      const imp = (hk.csvimp ?? '').trim();
      if (imp == CSVIMP_FOLDER || imp == CSVIMP_HONSHA) {
        const line = csvLine(kind, this.csvDoc(d), hk, masters.hktime, this.usrsrv.formatDate(new Date()));
        if (isOfficeCsv(kind)) {
          r.csv = { kind, sday: d.sday, line };
        } else if (imp == CSVIMP_FOLDER) {
          await this.nassrv.write(dir, moveCsv(kind), await this.sjis(line + '\r\n'));
        }
      }
      if (kind == 'CLOUD') {
        memo.push('Biz-Logi Cloud！！');
      }
    } else if ((hk?.htype ?? '').trim() == '複写式') {
      memo.push(d.hname + '！！');
    }
    await this.nassrv.write(dir, 'zmemo.txt', await this.sjis(memo.join('\r\n') + '\r\n'));
    r.dir = parentPath + '/' + name;
    const Done = gql`
      mutation upd_moveship($id: smallint!, $dno: Int!, $set: trmovsub_set_input!) {
        update_trmovsub(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    await firstValueFrom(this.apollo.mutate({
      mutation: Done, variables: { id, dno: denno, set: { shipdir: r.dir, ship_at: new Date(), ship_by: this.usrsrv.staff.code } }
    }));
    const csv = await this.saveOfficeCsv([r], csvDir, notes);
    return { results: [r], notes, ...csv };
  }

  /**
   * e飛伝Ⅱ・CLOUD の送り状 CSV（保存できた伝票の分）。出荷日・種類ごとに 1 ファイル（{yyyymmdd}hiden.csv・{yyyymmdd}CLOUD.csv）。
   * この PC の送り状CSVフォルダがあれば、そのファイルに追記する（同じ伝票の前の行は入れ替える）。無ければダウンロード用に返す
   */
  private async saveOfficeCsv(results: ShipResult[], csvDir: FileSystemDirectoryHandle | undefined, notes: string[]):
    Promise<{ csvSaved: string[]; downloads: { name: string; blob: Blob }[] }> {
    const groups = new Map<string, { kind: CsvKind; lines: string[] }>();
    for (const r of results.filter(e => !e.error && e.csv)) {
      const name = officeCsvName(r.csv!.kind, r.csv!.sday);
      const g = groups.get(name) ?? { kind: r.csv!.kind, lines: [] };
      g.lines.push(r.csv!.line);
      groups.set(name, g);
    }
    const csvSaved: string[] = [];
    const downloads: { name: string; blob: Blob }[] = [];
    for (const [name, g] of groups) {
      if (csvDir) {
        try {
          const nos = new Set(g.lines.map(l => officeCsvDenno(g.kind, l)));
          const old = await this.nassrv.read(csvDir, name);
          const keep = old
            ? new TextDecoder('shift_jis').decode(await old.arrayBuffer()).split(/\r?\n/)
              .filter(l => l.trim() && !nos.has(officeCsvDenno(g.kind, l)))
            : [];
          await this.nassrv.write(csvDir, name, await this.sjis([...keep, ...g.lines].join('\r\n') + '\r\n'));
          csvSaved.push(csvDir.name + '\\' + name);
          continue;
        } catch (e) {
          notes.push('送り状 CSV（' + name + '）を送り状CSVフォルダに保存できなかったので、ダウンロードします：' + (e as Error).message);
        }
      }
      downloads.push({ name, blob: await this.sjis(g.lines.join('\r\n') + '\r\n') });
    }
    return { csvSaved, downloads };
  }

  /** 送り状 CSV に使う配送方法・配送時間帯のマスタ */
  private async csvMasters(): Promise<{ hokuri: HokuriCsv[]; hktime: HktimeCsv[] }> {
    const Get = gql`
      query get_shipcsvmast($id: smallint!) {
        mshokuri(where: {id: {_eq: $id}}) { code name htype binshu mtchaku daibiki csvimp cuscode hscode }
        mshktime(where: {id: {_eq: $id}}) { hscode code bunrui }
      }`;
    const res = await firstValueFrom(this.apollo.query<{ mshokuri: HokuriCsv[]; mshktime: HktimeCsv[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid }
    }));
    if (res.error || !res.data) {
      throw new Error('配送方法マスタを読めませんでした');
    }
    return {
      hokuri: res.data.mshokuri.map(e => ({ ...e, code: String(e.code).trim() })),
      hktime: res.data.mshktime.map(e => ({ ...e, code: String(e.code).trim() }))
    };
  }

  /** 送り状 CSV にする伝票の値 */
  private csvDoc(d: ShipDoc): CsvDoc {
    const o = d.okuri;
    const first = d.lines.find(l => l.gcode);
    return {
      denno: d.denno, to: d.nsaki, irai: d.irai, okurino: d.okurino, okurisuu: d.okurisuu, sday: d.sday,
      hday: o?.hday ?? null, htime: o?.htime ?? null, omemo: o?.omemo ?? null, daibiki: o?.daibiki ?? null, daibzei: o?.daibzei ?? null,
      eidome: o?.eidome ?? null, eicode: o?.eicode ?? null,
      first: first ? { gtext: first.gtext ?? '', suu: first.suu } : undefined
    };
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

  /** 送り状番号（と配送コード）を受注伝票に書く */
  private async setOkurino(denno: number, okurino: string, hcode?: string): Promise<void> {
    const Upd = gql`
      mutation upd_shipokuri($id: smallint!, $dno: Int!, $set: trjyuden_set_input!) {
        update_trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}, _set: $set) { affected_rows }
      }`;
    const set: Record<string, string> = { okurino };
    if (hcode) {
      set['hcode'] = hcode;
    }
    const res = await firstValueFrom(this.apollo.mutate({ mutation: Upd, variables: { id: this.usrsrv.compid, dno: denno, set } }));
    if (res.error) {
      throw new Error('送り状番号を保存できませんでした：' + res.error.message);
    }
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
