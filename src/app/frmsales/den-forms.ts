/**
 * 受注伝票の帳票（No.33）。現行の通販Pro・出荷指示マクロの 24 種類を、4 つの様式にまとめた。
 *   ・money   金額のある帳票（お客様向け）: 請求書・見積書・納品書・出荷票
 *   ・work    作業指示書（倉庫・工場・外注・社内向け。金額なし）: オリマーク付け・工場渡し・発送依頼・加工稟議書・発注書など
 *   ・order   受注票（A4）
 *   ・furikomi 郵便振込用紙（専用の用紙に位置を合わせて印刷）
 * code は納品書タイプ（msbuntype）の番号。受注伝票の納品書タイプの帳票が最初に選ばれる。
 * 様式の違い（タイトル・指示欄・日付の見出しなど）はここで決め、日付の見出しは印刷のときにも選べる
 */

/** 日付の見出し（印刷のときに選べる） */
export type DayLabel = '受付日' | '売上日' | '出荷日' | '出荷予定日' | '発注日';
export const DAY_LABELS: DayLabel[] = ['受付日', '売上日', '出荷日', '出荷予定日', '発注日'];

/** 作業指示書の指示欄の 1 行 */
export type WorkLine =
  | { type: 'ori' }                 // オリマークNo.　×　枚
  | { type: 'kibou' }               // 出荷希望日：　月　日
  | { type: 'text'; text: string }; // 決まった文

export interface DenPrintForm {
  /** 納品書タイプの番号 */
  code: number;
  /** 帳票の名前（選択欄に出す） */
  name: string;
  kind: 'money' | 'work' | 'order' | 'furikomi';
  /** タイトル。{ate} は印刷のときに入れる宛先（空なら手書き用の空白） */
  title: string;
  /** 日付の見出しの初期値 */
  dayLabel: DayLabel;
  /** 宛先を印刷のときに聞く（タイトルの {ate}） */
  askAte?: boolean;

  // ---- 金額のある帳票 ----
  /** タイトルの下の文（下記の通り〜） */
  msg?: string;
  /** 大きく出す金額の見出し（御請求金額・御見積金額）。無ければ出さない */
  kingaku?: string;
  /** 登録番号と角印（請求書） */
  invoice?: boolean;
  /** 見積期限の文 */
  validity?: string;
  /** 振込のお願い文（請求書） */
  furikomiNote?: boolean;
  /** 別納（お客様直送）: 宛先の箱は納品先、下に［発注元］として受注先を出す */
  betsuno?: boolean;
  /** 明細の単価・金額を税込で出す */
  taxIn?: boolean;
  /** 合計に税抜商品計を出す（見積書） */
  goodsTotal?: boolean;
  /** 担当者の欄を出す */
  staff?: boolean;

  // ---- 作業指示書 ----
  /** 指示欄（右上） */
  work?: WorkLine[];
  /** 宛先の箱に住所の代わりに出す文（発注書の＜本社納品＞など）。受注先の名前は出す */
  boxText?: string;
  /** 下に「指示書　枚」を出す */
  shijisho?: boolean;
}

const ORI: WorkLine = { type: 'ori' };
const KIBOU: WorkLine = { type: 'kibou' };
const txt = (text: string): WorkLine => ({ type: 'text', text });

const SEIKYU = { kind: 'money', title: '御　請　求　書', msg: '下記の通り御請求申し上げます。', kingaku: '御請求金額', invoice: true, furikomiNote: true, dayLabel: '受付日' } as const;
const MITSU = { kind: 'money', title: '御　見　積　書', msg: '下記の通り御見積申し上げます。', kingaku: '御見積金額', validity: '見積期限：見積り提出後2週間', goodsTotal: true, dayLabel: '受付日' } as const;
const NOHIN = { kind: 'money', title: '納　品　書', dayLabel: '売上日' } as const;
const WORK = { kind: 'work', shijisho: true } as const;

export const DEN_PRINT_FORMS: DenPrintForm[] = [
  { ...WORK, code: 1, name: '朝来オリマーク付け', title: '【朝来倉庫にてｵﾘﾏｰｸ付けお願いします】', dayLabel: '売上日', work: [ORI, KIBOU] },
  { ...WORK, code: 2, name: '養父倉庫渡し', title: '【養父工場様にお渡し下さい】', dayLabel: '受付日' },
  { ...WORK, code: 3, name: '養父倉庫オリマーク外しあり', title: '【養父工場様にお渡し下さい＆朝来ｵﾘﾏｰｸ外し】', dayLabel: '受付日',
    work: [txt('①ｵﾘﾏｰｸを指示書に添付して下さい'), ORI, txt('②朝来ｵﾘﾏｰｸ取外し【　　　　　　　　　　】')] },
  { ...WORK, code: 4, name: 'コンタクト発送', title: 'コンタクト様へ発送お願いします。', dayLabel: '受付日' },
  { ...WORK, code: 5, name: '【発注書】養父(本社納品)', title: '【発注書】　養父工場　様', dayLabel: '発注日', boxText: '＜　本社納品　＞', shijisho: false },
  { ...WORK, code: 6, name: '【発注書】養父(朝来納品)', title: '【発注書】　養父工場　様', dayLabel: '発注日', boxText: '＜　朝来倉庫納品　＞', shijisho: false },
  { ...WORK, code: 7, name: '朝来オリマーク付+モール', title: '【朝来倉庫にてｵﾘﾏｰｸ付け・ﾓｰﾙ入お願いします】', dayLabel: '売上日', work: [ORI, KIBOU] },
  { ...WORK, code: 8, name: '堀商店発送', title: '堀商店様へ発送お願いします。', dayLabel: '受付日', shijisho: false },
  { ...SEIKYU, code: 9, name: '請求書(都度)' },
  { ...SEIKYU, code: 10, name: '請求書(都度・別納)', betsuno: true },
  { ...MITSU, code: 11, name: '見積書(都度)' },
  { ...NOHIN, code: 12, name: '納品書(都度)' },
  { ...NOHIN, code: 13, name: '納品書(都度・別納)', betsuno: true, staff: true },
  { kind: 'furikomi', code: 14, name: '新極真：郵便振込用紙', title: '郵便振込用紙', dayLabel: '受付日' },
  { ...MITSU, code: 16, name: '見積書(別納)', betsuno: true },
  { kind: 'money', code: 20, name: '出荷票(A4)', title: '出　荷　票', dayLabel: '売上日', staff: true },
  { kind: 'order', code: 21, name: '受注票(A4)', title: '受　注　票', dayLabel: '出荷予定日' },
  { ...WORK, code: 32, name: '大会準備リスト', title: '大会準備リスト', dayLabel: '出荷予定日', shijisho: false },
  { ...WORK, code: 33, name: '本社引取', title: '本社持ち帰りお願い致します', dayLabel: '売上日', shijisho: false },
  { ...WORK, code: 36, name: '○○へ発送お願いします', title: '【{ate}へ発送お願します】', dayLabel: '受付日', askAte: true },
  { ...WORK, code: 40, name: '加工稟議書(オリマークNo.指示)', title: '【{ate}様にお渡し下さい】', dayLabel: '受付日', askAte: true,
    work: [txt('***ｵﾘﾏｰｸを指示書に添付して下さい***'), ORI] },
  { ...WORK, code: 41, name: '加工稟議書(フリー)', title: '【{ate}】', dayLabel: '受付日', askAte: true },
  { ...WORK, code: 42, name: '加工稟議書(オリマークのみ渡し)', title: '【{ate}様にオリマークのみお渡し下さい】', dayLabel: '受付日', askAte: true,
    work: [ORI], shijisho: false },
  { ...SEIKYU, code: 43, name: '請求書(都度、明細税込み)', taxIn: true }
];

/** 様式の種類の名前（選択欄のグループ） */
export const KIND_NAMES: Record<DenPrintForm['kind'], string> = {
  money: '金額のある帳票', work: '作業指示書', order: '受注票', furikomi: '振込用紙'
};

/** 納品書タイプ（'01' でも '1' でもよい）の帳票。無ければ undefined */
export function findPrintForm(buntype: string | number | null | undefined): DenPrintForm | undefined {
  if (buntype == null || String(buntype).trim() == '') {
    return undefined;
  }
  const code = Number(buntype);
  return DEN_PRINT_FORMS.find(f => f.code == code);
}

/** 郵便振込用紙の口座（払込先） */
export const FURIKOMI_ACCOUNT = { kigo: '00930', check: '8', bango: '321279', name: '（株）マーシャルワールドジャパン' };
