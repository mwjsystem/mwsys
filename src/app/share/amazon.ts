/**
 * Amazon（ベンダーセントラル）との取引の固定値。受注取込・送り状番号の採番・Amazon 用納品書で使う。
 */

/** Amazon の顧客コード */
export const AMAZON_MCODE = '408223';

/** Amazon 側の取引業者コード（発注 CSV の「取引業者コード」。納品書の送信者に出す） */
export const AMAZON_VENDOR = 'UQ5V5';

/** Amazon 用納品書の請求先住所 */
export const AMAZON_BILL = {
  zip: '153-0064',
  lines: ['東京都 目黒区 下目黒 1-8-1 ARCO Tower Annex', 'アマゾンジャパン株式会社経理部仕入請求係気付'],
  name: 'アマゾン ジャパン合同会社宛'
} as const;

/** 配送の「同梱」（同じ日に同じ納品先へ送る Amazon の伝票を 1 つの荷物にまとめたとき、まとめられた側の配送コード） */
export const HCODE_DOKON = '49';

/** Amazon の受注か（顧客コードの前後の空白は無視する） */
export const isAmazon = (mcode: string | number | null | undefined): boolean => String(mcode ?? '').trim() == AMAZON_MCODE;

/** 受注伝票の備考（「… 着荷ウィンドウ 2024/07/05～2024/07/10」）から着荷ウィンドウを取り出す */
export const amazonWindow = (dmemo: string | null | undefined): string =>
  (dmemo ?? '').match(/着荷ウィンドウ\s*(\S+)/)?.[1] ?? '';
