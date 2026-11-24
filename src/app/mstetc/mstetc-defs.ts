/**
 * 小さなマスタ（担当者・倉庫・配送方法・帳票タイプ・文書）のメンテナンス画面の定義。
 * 画面（MstetcComponent）は 1 つで、表ごとの列だけをここで決める。
 * 表のキーはどれも (id = 会社ID, code)。コードは登録したあとは変えられない（伝票などが参照しているため）。
 * del の列がある表は、行を消さずに del（退職・削除）を付ける。del の無い表も行は消さない（画面に削除は無い）
 */

/**
 * 欄の種類。
 *   store = 倉庫の選択肢、hokuri = 配送方法の選択肢（ほかの画面と共用のサービスから）
 *   choice = 決まった値から選ぶ（options）、ref = ほかの表の行から選ぶ（ref）
 */
export type EtcFieldType = 'text' | 'int' | 'check' | 'memo' | 'store' | 'hokuri' | 'choice' | 'ref';

export interface EtcOption { value: string; label: string }

export interface EtcField {
  key: string;
  label: string;
  type: EtcFieldType;
  /** 必須 */
  req?: boolean;
  /** 入力欄の幅（文字数） */
  width?: number;
  /** 一覧に出す */
  list?: boolean;
  /** 欄の下に出す説明 */
  hint?: string;
  /** choice の選択肢 */
  options?: EtcOption[];
  /** ref の選択肢の前に足す決まった値（例: 第二帳票の NO = なし） */
  extra?: EtcOption[];
  /** ref の選択肢を読む表（id で絞り、code 順） */
  ref?: { table: string; value: string; label: string; num?: boolean };
}

export interface EtcDef {
  /** 表の名前（Hasura のルートフィールド名） */
  table: 'msstaff' | 'msstore' | 'mshokuri' | 'msbuntype' | 'msbunsho';
  title: string;
  /** del 列（無い表は undefined） */
  delKey?: string;
  /** del 列の意味（一覧の「…も出す」と欄の名前に使う） */
  delLabel?: string;
  /** 表示順の列（無い表は undefined。一覧はコード順） */
  sortKey?: string;
  /** コードの説明 */
  codeHint: string;
  /** 保存したあとに読み直す、ほかの画面の問い合わせ（選択肢など） */
  refetch: string[];
  fields: EtcField[];
  /** 画面の上に出す説明 */
  note: string;
}

const SORT_HINT = '小さい順に選択肢に並びます。空は最後';

export const STAFF_DEF: EtcDef = {
  table: 'msstaff',
  title: '担当者マスタ',
  delKey: 'del',
  delLabel: '退職',
  sortKey: 'sort',
  codeHint: '伝票の担当者に入るコードです。登録したあとは変えられません',
  refetch: ['get_staff'],
  note: 'メールアドレスはログインに使うアドレスと同じにします（ログインした人の担当者コード・倉庫の初期値をここから決めます）。'
    + '辞めた人は「退職」にすると、担当者の選択肢に出なくなります（過去の伝票の名前はそのまま出ます）。',
  fields: [
    { key: 'sei', label: '姓', type: 'text', req: true, width: 10, list: true },
    { key: 'mei', label: '名', type: 'text', width: 10, list: true },
    { key: 'mail', label: 'メールアドレス', type: 'text', width: 28, list: true, hint: 'ログインに使うアドレス' },
    { key: 'scode', label: '倉庫の初期値', type: 'store', list: true, hint: '新しい伝票の倉庫に最初に入る倉庫' },
    { key: 'sort', label: '表示順', type: 'int', width: 6, list: true, hint: SORT_HINT },
  ],
};

export const STORE_DEF: EtcDef = {
  table: 'msstore',
  title: '倉庫マスタ',
  delKey: 'del',
  delLabel: '削除',
  sortKey: 'sort',
  codeHint: '伝票の倉庫に入るコードです。登録したあとは変えられません',
  refetch: ['get_souko'],
  note: '倉庫名称・住所・電話・FAX は、移動伝票や指示書などの帳票の宛先に出ます。'
    + '使わなくなった倉庫は「削除」にすると、倉庫の選択肢に出なくなります（在庫や過去の伝票はそのまま残ります）。',
  fields: [
    { key: 'name', label: '倉庫名称', type: 'text', req: true, width: 24, list: true, hint: '帳票の宛先に出る正式な名前' },
    { key: 'subname', label: '倉庫略称', type: 'text', width: 14, list: true, hint: '画面の選択肢に出る短い名前' },
    { key: 'zip', label: '郵便番号', type: 'text', width: 9 },
    { key: 'region', label: '都道府県', type: 'text', width: 24, list: true },
    { key: 'local', label: '市区町村', type: 'text', width: 24 },
    { key: 'street', label: '町名・番地', type: 'text', width: 24 },
    { key: 'extend', label: '建物その他', type: 'text', width: 24 },
    { key: 'tel', label: '電話番号', type: 'text', width: 14, list: true },
    { key: 'tel2', label: '電話番号2', type: 'text', width: 14 },
    { key: 'tel3', label: '電話番号3', type: 'text', width: 14 },
    { key: 'fax', label: 'FAX番号', type: 'text', width: 14, list: true },
    { key: 'hcode', label: '配送方法の初期値', type: 'hokuri', list: true },
    { key: 'days', label: '加工に要する日数', type: 'int', width: 6, hint: '営業日。預け倉庫（加工先）で入れます' },
    { key: 'shfolder', label: '出荷フォルダ格納先', type: 'text', width: 40, hint: '出荷データを置く NAS のフォルダ' },
    { key: 'memo', label: '備考', type: 'memo' },
    { key: 'sort', label: '表示順', type: 'int', width: 6, list: true, hint: SORT_HINT },
  ],
};

/** 送り状タイプ（ship-csv.ts の CSV_KINDS と、CSV を作らない種類） */
const HTYPES: EtcOption[] = [
  { value: 'PCCS', label: 'PCCS（佐川 BizLogi Depo の CSV）' },
  { value: 'CLOUD', label: 'CLOUD（佐川 BizLogi Cloud の CSV）' },
  { value: 'e飛伝Ⅱ', label: 'e飛伝Ⅱ（佐川 e飛伝Ⅱ の CSV）' },
  { value: 'iSⅡ', label: 'iSⅡ（福山通運の CSV）' },
  { value: '複写式', label: '複写式（手書きの送り状）' },
  { value: 'ゆうプリ', label: 'ゆうプリ（CSV は作らない）' },
  { value: 'しない', label: 'しない（送り状を出さない）' },
];

export const HOKURI_DEF: EtcDef = {
  table: 'mshokuri',
  title: '配送方法マスタ',
  sortKey: 'order',
  codeHint: '受注伝票の配送方法に入るコードです。登録したあとは変えられません',
  refetch: ['get_okuri'],
  note: '送り状タイプ・CSV取込場・便種・元着区分・代引・運送会社顧客コードで、出荷指示のときに作る送り状 CSV が決まります。'
    + '変えたあとは、開いている出荷指示などの画面を読み直してください。使わなくなった配送方法は、表示順を空にすると選択肢の最後に回ります。',
  fields: [
    { key: 'name', label: '名称', type: 'text', req: true, width: 16, list: true },
    { key: 'htype', label: '送り状タイプ', type: 'choice', req: true, list: true, options: HTYPES },
    { key: 'hscode', label: '配送会社', type: 'ref', list: true, ref: { table: 'mshaisou', value: 'code', label: 'name', num: true },
      hint: '送り状番号の採番・追跡 URL・配送時間帯に使います' },
    { key: 'csvimp', label: 'CSV取込場', type: 'choice', list: true,
      options: [{ value: 'shuk', label: 'shuk（朝来の出荷）' }, { value: '021', label: '021（本社）' }, { value: '01', label: '01' }],
      hint: 'shuk か 021 のときだけ送り状 CSV を作ります' },
    { key: 'scode', label: '出荷倉庫', type: 'store', list: true },
    { key: 'binshu', label: '便種', type: 'text', width: 6, hint: '送り状 CSV の便種コード（例: 000、001）' },
    { key: 'mtchaku', label: '元着区分', type: 'text', width: 6, hint: '送り状 CSV の元着区分（PCCS は 01、e飛伝Ⅱ は 1 = 元払・2 = 着払 など）' },
    { key: 'daibiki', label: '代引', type: 'choice', list: true,
      options: [{ value: '1', label: '1 代引き' }, { value: '2', label: '2 代引（eコレクト。クレジットも可）' }], hint: '空 = 代引きでない' },
    { key: 'cuscode', label: '運送会社顧客コード', type: 'text', width: 16, hint: '佐川の顧客コード / 福通の荷送人コード' },
    { key: 'order', label: '表示順', type: 'int', width: 6, list: true, hint: SORT_HINT },
  ],
};

/** 同梱（saki / sksec） */
const DOKON: EtcOption[] = [
  { value: 'shuk', label: 'する（荷物に同梱）' },
  { value: 'hkan', label: 'しない（控えだけ）' },
  { value: 'hkae', label: '受注先書式（控えだけ）' },
];
const BUNSHO_REF = { table: 'msbunsho', value: 'code', label: 'name' };

export const BUNTYPE_DEF: EtcDef = {
  table: 'msbuntype',
  title: '帳票タイプマスタ',
  codeHint: '受注伝票の納品書タイプに入るコードです（01 と 1 は同じタイプとして扱います）。登録したあとは変えられません',
  refetch: [],
  note: '受注伝票の納品書タイプで、出荷指示のときに作る帳票（第一帳票・第二帳票）と、荷物に同梱するかが決まります。'
    + '帳票のタイトル・文言・金額の見出しは「文書マスタ」で決めます。変えたあとは、開いている出荷指示の画面を読み直してください。',
  fields: [
    { key: 'name', label: '名称', type: 'text', req: true, width: 20, list: true },
    { key: 'first', label: '第一帳票', type: 'ref', req: true, list: true, ref: BUNSHO_REF, hint: '文書マスタの文書' },
    { key: 'saki', label: '第一帳票の同梱', type: 'choice', req: true, list: true, options: DOKON,
      hint: '「する」だけ出荷指示フォルダに入れて荷物に同梱します。控え（納品書控フォルダ）にはどれも保存します' },
    { key: 'second', label: '第二帳票', type: 'ref', list: true, ref: BUNSHO_REF, extra: [{ value: 'NO', label: 'なし' }] },
    { key: 'sksec', label: '第二帳票の同梱', type: 'choice', list: true, options: [...DOKON, { value: 'NNNO', label: 'なし（NNNO）' }] },
  ],
};

export const BUNSHO_DEF: EtcDef = {
  table: 'msbunsho',
  title: '文書マスタ',
  codeHint: '帳票タイプマスタの第一帳票・第二帳票から指すコードです。登録したあとは変えられません',
  refetch: [],
  note: '納品書・請求書・領収書などの帳票の、タイトル・文言・金額の見出し・角印・宛先・発行元を決めます。'
    + '変えたあとは、開いている出荷指示の画面を読み直してください。',
  fields: [
    { key: 'name', label: '名前', type: 'text', req: true, width: 24, list: true, hint: '帳票タイプマスタで選ぶときの名前' },
    { key: 'title', label: 'タイトル', type: 'text', req: true, width: 20, list: true, hint: '帳票の一番上に出る文字（領収書で始まると日付の見出しが「発行日」になります）' },
    { key: 'message', label: '文言', type: 'text', req: true, width: 30, list: true, hint: '例: 下記の通り、納品致します。' },
    { key: 'gakutxt', label: '金額の見出し', type: 'text', width: 12, list: true, hint: '例: 税込金額・御請求額。「表示なし」で金額を出しません' },
    { key: 'stamp', label: '角印', type: 'check', list: true },
    { key: 'atesaki', label: '宛先', type: 'choice', req: true, list: true,
      options: [{ value: 'mcode', label: '受注先' }, { value: 'ncode', label: '納品先' }] },
    { key: 'hmoto', label: '発行元', type: 'choice', list: true,
      options: [{ value: 'mcode', label: '受注先' }, { value: 'iadr', label: '依頼主' }], hint: '空 = 自社（MWJ）' },
  ],
};
