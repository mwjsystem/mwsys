/**
 * 出荷指示（納品書・出荷指示書）の様式の設定。
 * 現行の Excel マクロ「伝票一括処理.xlsm」の master シート（帳票タイプ）と、出荷指示書の商品コードごとの注記を移したもの。
 * （品番の一覧で決まる注記〈事務所同梱・芦原・手塚・品番注意〉と並び順〈sort.xlsx〉は、後の段階でマスタにする）
 */

/** 受注ステータス（分類マスタ kubun = 'jdstatus'） */
export const JDST = {
  MIHOZON: '0',
  KARI: '1',
  TOROKU: '2',
  /** 出荷指示フォルダ作成済（NAS へ保存した） */
  FOLDER: '3',
  /** 出荷指示出力済（倉庫で印刷した） */
  PRINTED: '4',
  /** ピッキング済（倉庫のスマホで商品を確認した） */
  PICKED: '5',
  KANRYO: '6',
  TORIKESI: '9'
} as const;

/** 帳票タイプ（受注伝票の buntype） */
export interface DenForm {
  code: number;
  name: string;
  /** 帳票のタイトル */
  title: string;
  /** 文言（例: 下記の通り、納品致します。） */
  msg: string;
  /** 金額の見出し。'表示なし' は金額を出さない */
  kingaku: '税込金額' | '御請求額' | '表示なし';
  /** 納品書を荷物に同梱するか（'する' のときだけ NAS の出荷指示フォルダに入れる） */
  dokon: 'する' | 'しない' | '受注先書式';
  /** 角印 */
  stamp: boolean;
  /** 宛先 */
  ate: '受注先' | '納品先';
  /** 発行元（MWJ = 自社。受注先・依頼主 = その住所を発行元に出す） */
  issuer: 'MWJ' | '受注先' | '依頼主';
  /** 第二帳票（帳票タイプのコード。'MWJ_A5' は受注先宛の控えで、NAS には入れない） */
  second: number | 'MWJ_A5' | null;
  /** 日付の見出し */
  dayText: string;
}

const f = (code: number, name: string, title: string, msg: string, kingaku: DenForm['kingaku'], dokon: DenForm['dokon'],
  stamp: boolean, ate: DenForm['ate'], issuer: DenForm['issuer'], second: DenForm['second'], dayText: string): DenForm =>
  ({ code, name, title, msg, kingaku, dokon, stamp, ate, issuer, second, dayText });

const NOHIN = '下記の通り、納品致します。';
const SEIKYU = '下記の通り、ご請求申し上げます。';
const RYOSHU = '下記の通り、領収致しました。';

export const DEN_FORMS: DenForm[] = [
  f(1, '納品書のみ', '納品書', NOHIN, '税込金額', 'する', false, '受注先', 'MWJ', null, '売上日:'),
  f(2, '請求書兼納品書', '請求書（兼納品書）', SEIKYU, '御請求額', 'する', true, '受注先', 'MWJ', null, '売上日:'),
  f(3, '領収書兼納品書', '領収書（兼納品書）', RYOSHU, '税込金額', 'する', true, '受注先', 'MWJ', null, '発行日:'),
  f(4, '納品書なし', '納品書', NOHIN, '税込金額', 'しない', false, '受注先', 'MWJ', null, '売上日:'),
  f(5, '受注先⇒納品先(￥無)', '納品書', NOHIN, '表示なし', 'する', false, '納品先', '受注先', 'MWJ_A5', '売上日:'),
  f(6, '請求書と納品書', '請求書', SEIKYU, '御請求額', 'する', true, '受注先', 'MWJ', 1, '売上日:'),
  f(7, '請求兼納品書(同梱無)', '請求書（兼納品書）', SEIKYU, '御請求額', 'しない', true, '受注先', 'MWJ', null, '売上日:'),
  f(8, '客先指定納品書', '納品書', NOHIN, '税込金額', '受注先書式', false, '受注先', 'MWJ', null, '売上日:'),
  f(9, '現金回収用納品書', '領収書（兼納品書）', RYOSHU, '税込金額', 'しない', true, '受注先', 'MWJ', 10, '発行日:'),
  f(10, '受領書', '受領書', '下記の通り、受領しました。', '税込金額', 'しない', false, '受注先', 'MWJ', null, '売上日:'),
  f(11, '納品書(依頼主発行)', '納品書', NOHIN, '税込金額', 'する', false, '受注先', '依頼主', null, '売上日:'),
  f(12, '請求書兼納品書(依)', '請求書（兼納品書）', SEIKYU, '御請求額', 'する', false, '受注先', '依頼主', null, '売上日:'),
  f(13, '領収書兼納品書(依)', '領収書（兼納品書）', RYOSHU, '税込金額', 'する', false, '受注先', '依頼主', null, '発行日:'),
  f(14, '出荷票', '納品書', NOHIN, '表示なし', 'する', false, '受注先', 'MWJ', null, '売上日:'),
  f(15, '出荷票と請求書', '請求書', SEIKYU, '御請求額', '受注先書式', true, '受注先', 'MWJ', 14, '売上日:'),
  f(16, '納品書なし', '納品書', NOHIN, '税込金額', 'しない', false, '受注先', 'MWJ', null, '売上日:'),
  f(17, '領収兼納品書(同梱無)', '領収書（兼納品書）', RYOSHU, '税込金額', 'しない', true, '受注先', 'MWJ', null, '発行日:'),
  f(18, '領収書と納品書', '領収書', RYOSHU, '税込金額', 'する', true, '受注先', 'MWJ', 1, '発行日:'),
  f(19, '納品書と同梱無請求書', '請求書', SEIKYU, '御請求額', 'しない', true, '受注先', 'MWJ', 1, '発行日:'),
  f(20, '納品書と同梱無領収書', '領収書', RYOSHU, '税込金額', 'しない', true, '受注先', 'MWJ', 1, '発行日:'),
  f(21, '受注先⇒納品先(￥有)', '納品書', NOHIN, '税込金額', 'する', false, '納品先', '受注先', null, '発行日:'),
  f(22, '(再発行)領収書', '領収書（再発行）', RYOSHU, '税込金額', 'する', true, '受注先', 'MWJ', null, '発行日:')
];

/** 帳票タイプ（buntype。'01' でも '1' でもよい）の設定。無ければ undefined */
export function denForm(buntype: string | number | null | undefined): DenForm | undefined {
  const code = Number(buntype);
  return DEN_FORMS.find(e => e.code == code);
}

/** 出荷指示書の検品欄（現行の様式 form3 の左上。倉庫の担当者名） */
export const CHECKERS: string[][] = [['石井', '菖蒲池'], ['西垣', '小野山'], ['藤原', '水谷']];

/** 出荷指示書の明細の注記 */
export interface ShipNote {
  /** 商品コード欄に出す文字 */
  code: string;
  /** 備考欄 */
  note: string;
  /** 商品コードを太字にする */
  bold: boolean;
  /** 商品名の代わりに明細備考を大きく出す（作業の指示の行） */
  memoOnly: boolean;
  /** 検品のチェック欄を付ける（実物の商品） */
  check: boolean;
  /** 事務所から同梱する商品 */
  jimu: boolean;
}

/**
 * 商品コードから出荷指示書の注記を決める（現行マクロ Main_Proc の出荷指示書明細と同じ規則）。
 * mcode は受注先（100004 のときは *MM* を事務所同梱にする）
 */
export function shipNote(gcode: string, gtext: string, mcode: string): ShipNote {
  const c = gcode.trim();
  const like = (re: RegExp) => re.test(c);
  const ret: ShipNote = { code: c, note: '', bold: false, memoOnly: false, check: false, jimu: false };
  if (like(/^NGRI/) || like(/^NGD/) || like(/^NGLRL/) || (like(/^NGK/) && !like(/^NGKO/)) || (mcode == '100004' && like(/MM/))) {
    ret.code = '※' + c;
    ret.note = '事務所より';
    ret.jimu = true;
  } else if (c == 'Z01') {
    ret.code = 'Z' + c;
  } else if (c == 'Z11' || c == 'PRINT' || c == 'Z05') {
    ret.code = c + '(' + gtext + ')';
    ret.bold = true;
  } else if (like(/^WT-/)) {
    ret.note = '※１箱単位で出荷';
  } else if (like(/^KKS3/) || like(/^KD2/)) {
    ret.note = '純白';
  } else if (like(/^KU9.*-K-/) || like(/^KU9.*-K$/)) {
    ret.note = '極真純白';
    ret.bold = true;
  } else if (like(/^KU[85].*-K-/) || like(/^KU[85].*-K$/) || like(/^KUS1.*-K$/) || like(/^CB-K/) || like(/^CBKK1/)) {
    ret.note = '極真';
    ret.bold = true;
  } else if (like(/^KHS.*-D$/)) {
    ret.note = '※曇り止め付';
    ret.bold = true;
  } else if (c == 'KK-SET-ST') {
    ret.note = '※赤白セット※';
    ret.bold = true;
  }
  ret.memoOnly = ['Z99', 'Z11', 'Z14', 'PRINT', 'Z06', 'Z05', 'MALL', 'TAPE'].includes(c);
  ret.check = (!c.startsWith('Z') && !['PRINT', 'MALL', 'TAPE'].includes(c)) || c == 'Z99' || c.startsWith('ZERO') || c.startsWith('ZEKKEN');
  return ret;
}

/** 帯（CB で始まり CBSP・CBS- 以外）か。出荷指示書に帯の本数を出すため */
export function isObi(gcode: string): boolean {
  const c = gcode.trim();
  return c.startsWith('CB') && !c.startsWith('CBSP') && !c.startsWith('CBS-');
}
