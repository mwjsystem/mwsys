/** 操作ログ（tropelog）の作業区分（msbunrui kubun = extype）: 商品マスタ。DB のトリガー（db/20261121_goods_history.sql）と同じ値 */
export const EXTYPE_GOODS = '14';

/** 単価の列（tanka1 は通販定価（税込）、tanka2〜9 は税抜） */
export const TANKA_KEYS = ['tanka1', 'tanka2', 'tanka3', 'tanka4', 'tanka5', 'tanka6', 'tanka7', 'tanka8', 'tanka9'] as const;
export type TankaKey = typeof TANKA_KEYS[number];
