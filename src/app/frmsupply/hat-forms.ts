/**
 * 発注伝票の帳票（発注書）の様式。現行（通販Pro）の 15 様式（work/paper/発注書）を、次のようにまとめた。
 *   ・「倉庫」と「納入先指定」の組（1/2, 3/4, 5/6, 13/14, 15/16）は発送先だけが違うので、1 つにして発送先を印刷のときに選ぶ
 *     （倉庫 / 受注伝票の納品先（直送）/ 空欄（手書き））
 *   ・番号は現行の番号のまま（使っている人が探しやすいように）
 */

/** 単価・金額の出し方。amount = 単価・金額・税抜合計、tanka = 単価と税込合計、none = 出さない */
export type HatPrice = 'amount' | 'tanka' | 'none';
/** 文字の大きさ。normal = 標準、big = でか文字（品番・数量が大きい）、huge = 超でか文字（1 ページ 3 行） */
export type HatSize = 'normal' | 'big' | 'huge';

export interface HatPrintForm {
  code: number;
  name: string;
  /** 海外発注書（英文の Purchase Order。A4 横） */
  po?: 'FOB' | 'C&F';
  /** タイトル */
  title: string;
  /** 宛名の下の文 */
  msg: string;
  price: HatPrice;
  size: HatSize;
  /** 日付の見出し（発注日 / 依頼日） */
  dayLabel: string;
  /** 番号の見出し（発注番号 / 番号） */
  noLabel: string;
  /** 備考の欄に希望納期（明細の入荷予定日）を出す */
  nouki?: boolean;
  /** 差出人を倉庫にする（倉庫から直接発注する。ReFAX は倉庫へ） */
  fromStore?: boolean;
}

export const HAT_PRINT_FORMS: HatPrintForm[] = [
  { code: 1, name: '発注書（金額あり）', title: '発　注　書', msg: '下記の通りご注文申し上げます。', price: 'amount', size: 'normal', dayLabel: '発注日', noLabel: '発注番号' },
  { code: 3, name: '発注書（金額なし）', title: '発　注　書', msg: '下記の通りご注文申し上げます。', price: 'none', size: 'normal', dayLabel: '発注日', noLabel: '発注番号' },
  { code: 5, name: '発注書（でか文字）', title: '【発　注　書】', msg: '下記の通りご注文申し上げます。', price: 'tanka', size: 'big', dayLabel: '発注日', noLabel: '発注番号' },
  { code: 10, name: '発注書（でか文字・希望納期）', title: '【発　注　書】', msg: '下記の通りご注文申し上げます。', price: 'none', size: 'big', dayLabel: '発注日', noLabel: '発注番号', nouki: true },
  { code: 13, name: '発注書（超でか文字）', title: '【発　注　書】', msg: '下記の通りご注文申し上げます。', price: 'none', size: 'huge', dayLabel: '発注日', noLabel: '発注番号' },
  { code: 15, name: '発注書（でか文字・倉庫から発注）', title: '【発　注　書】', msg: '下記の通りご注文申し上げます。', price: 'none', size: 'big', dayLabel: '発注日', noLabel: '発注番号', fromStore: true },
  { code: 9, name: '見積り依頼書', title: '【見積り依頼】', msg: '下記の内容で御見積りお願い申し上げます。', price: 'none', size: 'big', dayLabel: '依頼日', noLabel: '番号' },
  { code: 17, name: '在庫確認依頼', title: '【在庫確認依頼】', msg: '下記商品の在庫確認をお願い致します。', price: 'none', size: 'big', dayLabel: '発注日', noLabel: '発注番号' },
  { code: 11, name: '海外発注書（FOB）', po: 'FOB', title: 'Purchase Order', msg: '', price: 'amount', size: 'normal', dayLabel: 'P.O Date', noLabel: 'P.O No' },
  { code: 12, name: '海外発注書（C&F）', po: 'C&F', title: 'Purchase Order', msg: '', price: 'amount', size: 'normal', dayLabel: 'P.O Date', noLabel: 'P.O No' }
];

/** 発送先の選び方。store = 発注伝票の倉庫、nsaki = 受注伝票の納品先（お客様へ直送）、blank = 空欄（手書き） */
export type HatShipTo = 'store' | 'nsaki' | 'blank';
export const HAT_SHIP_TO: { value: HatShipTo; name: string }[] = [
  { value: 'store', name: '倉庫' },
  { value: 'nsaki', name: '受注伝票の納品先（直送）' },
  { value: 'blank', name: '空欄（手書き）' }
];

/**
 * 発注伝票の FAX の流れ（手で更新する）。
 * ① 発注書を印刷して発注先へ FAX → ② 発注先から Refax（納期の回答）を受け取る → ③ Refax を倉庫へ FAX
 * 列は trhatden の {key}_at（日時）と {key}_by（担当者）。db/20261112_hatden_fax.sql
 */
export type FaxStep = 'ofax' | 'refax' | 'sfax';
export const FAX_STEPS: { key: FaxStep; no: string; name: string; short: string }[] = [
  { key: 'ofax', no: '①', name: '発注先へFAX', short: 'FAX済' },
  { key: 'refax', no: '②', name: 'Refax受領', short: 'Refax受領' },
  { key: 'sfax', no: '③', name: '倉庫へFAX', short: '倉庫FAX済' }
];

/** FAX の流れの状態（日時・担当者。未済は null） */
export type FaxStatus = Record<`${FaxStep}_at` | `${FaxStep}_by`, string | null>;
export const FAX_EMPTY: FaxStatus = { ofax_at: null, ofax_by: null, refax_at: null, refax_by: null, sfax_at: null, sfax_by: null };

/** 状態の短い表示（一覧用）。済んでいる一番後の段階。何も済んでいなければ「未FAX」 */
export function faxLabel(s: Partial<FaxStatus>): string {
  for (let i = FAX_STEPS.length - 1; i >= 0; i--) {
    if (s[`${FAX_STEPS[i].key}_at`]) {
      return FAX_STEPS[i].no + FAX_STEPS[i].short;
    }
  }
  return '未FAX';
}
