/**
 * 小さなマスタ（担当者・倉庫）のメンテナンス画面の定義。
 * 画面（MstetcComponent）は 1 つで、表ごとの列だけをここで決める。
 * 表のキーはどちらも (id = 会社ID, code)。コードは登録したあとは変えられない（伝票が参照しているため）。
 * 消すときは行を消さずに del（退職・削除）を付ける
 */

/** 欄の種類。select の候補は画面側で用意する（store = 倉庫、hokuri = 配送方法） */
export type EtcFieldType = 'text' | 'int' | 'check' | 'memo' | 'store' | 'hokuri';

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
}

export interface EtcDef {
  /** 表の名前（Hasura のルートフィールド名） */
  table: 'msstaff' | 'msstore';
  title: string;
  /** del 列の意味（一覧の「…も出す」と欄の名前に使う） */
  delLabel: string;
  /** コードの説明 */
  codeHint: string;
  /** 保存したあとに読み直す、ほかの画面の問い合わせ（担当者・倉庫の選択肢） */
  refetch: string[];
  fields: EtcField[];
  /** 画面の上に出す説明 */
  note: string;
}

export const STAFF_DEF: EtcDef = {
  table: 'msstaff',
  title: '担当者マスタ',
  delLabel: '退職',
  codeHint: '伝票の担当者に入るコードです。登録したあとは変えられません',
  refetch: ['get_staff'],
  note: 'メールアドレスはログインに使うアドレスと同じにします（ログインした人の担当者コード・倉庫の初期値をここから決めます）。'
    + '辞めた人は「退職」にすると、担当者の選択肢に出なくなります（過去の伝票の名前はそのまま出ます）。',
  fields: [
    { key: 'sei', label: '姓', type: 'text', req: true, width: 10, list: true },
    { key: 'mei', label: '名', type: 'text', width: 10, list: true },
    { key: 'mail', label: 'メールアドレス', type: 'text', width: 28, list: true, hint: 'ログインに使うアドレス' },
    { key: 'scode', label: '倉庫の初期値', type: 'store', list: true, hint: '新しい伝票の倉庫に最初に入る倉庫' },
    { key: 'sort', label: '表示順', type: 'int', width: 6, list: true, hint: '小さい順に選択肢に並びます。空は最後' },
  ],
};

export const STORE_DEF: EtcDef = {
  table: 'msstore',
  title: '倉庫マスタ',
  delLabel: '削除',
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
    { key: 'sort', label: '表示順', type: 'int', width: 6, list: true, hint: '小さい順に選択肢に並びます。空は最後' },
  ],
};
