/**
 * 出荷指示（納品書・出荷指示書）の様式の設定。
 * 帳票タイプは納品書タイプマスタ・文書マスタから作る（現行の Excel マクロ「伝票一括処理.xlsm」の master シートの置き換え）。
 * 出荷指示書の商品コードごとの注記は、現行マクロの規則を移したもの。
 * （品番の一覧で決まる注記〈事務所同梱・芦原・手塚・品番注意〉と並び順〈sort.xlsx〉は、後の段階でマスタにする）
 */

/** 受注ステータス（分類マスタ kubun = 'jdstatus'） */
export const JDST = {
  MIHOZON: '00',
  KARI: '10',
  TOROKU: '20',
  /** キープ表FAX済（NAS の asago宛FAX に保存した） */
  KEEP_FAX: '21',
  /** キープ表FAX後の変更（FAX 後に明細が増えた・数量が変わった。送り直しが必要） */
  KEEP_CHANGED: '22',
  /** キープ確認済（倉庫のスマホで、すべて確保できた） */
  KEEP_OK: '23',
  /** 欠品（倉庫のスマホで、確保できない明細があった） */
  KEEP_SHORT: '24',
  /** 出荷指示フォルダ作成済（NAS へ保存した） */
  FOLDER: '30',
  /** 出荷指示出力済（倉庫で印刷した） */
  PRINTED: '40',
  /** ピッキング済（倉庫のスマホで商品を確認した） */
  PICKED: '50',
  KANRYO: '60',
  TORIKESI: '90'
} as const;

/** キープ表の段階（FAX 済〜欠品）か */
export const isKeepStage = (s: string | null | undefined): boolean =>
  s == JDST.KEEP_FAX || s == JDST.KEEP_CHANGED || s == JDST.KEEP_OK || s == JDST.KEEP_SHORT;

/**
 * 帳票（1 枚分）の様式。納品書タイプマスタ（msbuntype）の第一・第二帳票が指す、文書マスタ（msbunsho）の 1 行から作る
 * （現行の master シートの「文章指定」の置き換え）
 */
export interface DenForm {
  /** 納品書タイプのコード（数値） */
  code: number;
  /** 納品書タイプの名前（第二帳票は文書の名前） */
  name: string;
  /** 帳票のタイトル */
  title: string;
  /** 文言（例: 下記の通り、納品致します。） */
  msg: string;
  /** 金額の見出し（税込金額・御請求額 など）。'表示なし' は金額を出さない */
  kingaku: string;
  /**
   * 荷物に同梱するか（msbuntype の saki / sksec）。'する'（shuk）だけ出荷指示フォルダに入れる。
   * 'しない'（hkan）・'受注先書式'（hkae）は入れない。控え（納品書控フォルダ）にはどれも保存する
   */
  dokon: 'する' | 'しない' | '受注先書式';
  /** 角印 */
  stamp: boolean;
  /** 宛先（atesaki: mcode = 受注先、ncode = 納品先） */
  ate: '受注先' | '納品先';
  /** 発行元（hmoto: 空 = 自社、mcode = 受注先、iadr = 依頼主） */
  issuer: 'MWJ' | '受注先' | '依頼主';
  /** 第二帳票（無ければ null） */
  second: DenForm | null;
  /** 日付の見出し（領収書は発行日、それ以外は売上日） */
  dayText: string;
  /** Amazon 納品書（文書 24。様式は Amazon 用の納品書） */
  amazon: boolean;
}

/** 納品書タイプマスタ（msbuntype）の行 */
export interface BuntypeRow { code: string; name: string; first: string | null; saki: string | null; second: string | null; sksec: string | null }
/** 文書マスタ（msbunsho）の行 */
export interface BunshoRow {
  code: string; name: string; title: string | null; gakutxt: string | null; stamp: boolean | number | string | null;
  atesaki: string | null; message: string | null; hmoto: string | null;
}

/** Amazon 納品書の文書コード */
const BUNSHO_AMAZON = '24';

const dokonOf = (saki: string | null): DenForm['dokon'] => {
  const s = (saki ?? '').trim();
  return s == 'shuk' ? 'する' : s == 'hkae' ? '受注先書式' : 'しない';
};

function bunshoForm(code: number, name: string, b: BunshoRow, dokon: DenForm['dokon'], second: DenForm | null): DenForm {
  const title = (b.title ?? b.name ?? '').trim();
  const hmoto = (b.hmoto ?? '').trim();
  return {
    code, name, title, msg: (b.message ?? '').trim(), kingaku: (b.gakutxt ?? '').trim() || '表示なし', dokon,
    stamp: b.stamp === true || Number(b.stamp) == 1 || String(b.stamp).toLowerCase() == 'true',
    ate: (b.atesaki ?? '').trim() == 'ncode' ? '納品先' : '受注先',
    issuer: hmoto == 'mcode' ? '受注先' : hmoto == 'iadr' ? '依頼主' : 'MWJ',
    second, dayText: title.startsWith('領収書') ? '発行日:' : '売上日:', amazon: b.code.trim() == BUNSHO_AMAZON
  };
}

/** 納品書タイプマスタ・文書マスタから、納品書タイプごとの様式を作る（文書が見つからないタイプは入れない） */
export function buildForms(types: BuntypeRow[], bunshos: BunshoRow[]): DenForm[] {
  const bs = (code: string | null) => bunshos.find(b => b.code.trim() == (code ?? '').trim());
  const ret: DenForm[] = [];
  for (const t of types) {
    const b1 = bs(t.first);
    if (!b1) {
      continue;
    }
    const b2 = bs(t.second);
    const second = b2 ? bunshoForm(Number(t.code), b2.name, b2, dokonOf(t.sksec), null) : null;
    ret.push(bunshoForm(Number(t.code), t.name, b1, dokonOf(t.saki), second));
  }
  return ret;
}

/** 帳票タイプ（buntype。'01' でも '1' でもよい）の様式。無ければ undefined */
export function findForm(forms: DenForm[], buntype: string | number | null | undefined): DenForm | undefined {
  if (buntype == null || String(buntype).trim() == '') {
    return undefined;
  }
  const code = Number(buntype);
  return forms.find(e => e.code == code);
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
