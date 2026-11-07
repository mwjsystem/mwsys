import type { ShipAdr } from './ship-pdf.service';

/**
 * 配送業者の送り状 CSV（現行の「伝票一括処理.xlsm」の Edit_Csv_PccsWeb / Edit_Csv_eHiden / Edit_Csv_is2）。
 * どれを作るかは配送方法マスタ（mshokuri）で決める:
 *   ・htype（タイプ）: PCCS（佐川 BizLogi Depo）・CLOUD（佐川 BizLogi Cloud）・e飛伝Ⅱ（佐川）・iSⅡ（福山通運）
 *   ・csvimp（CSV 取込場）が 'shuk' か '021' のときだけ作る（空などは作らない）
 *   ・PCCS・iSⅡ: 出荷指示フォルダに伝票ごとの CSV（{伝票番号}pccs.csv・iS2.csv。倉庫の印刷で取り込み用フォルダへコピー）
 *   ・e飛伝Ⅱ・CLOUD: 出荷指示フォルダには入れず、出荷指示をした事務の PC の送り状CSVフォルダの {yyyymmdd}hiden.csv・CLOUD.csv に
 *     追記する（同じ伝票の前の行は入れ替える）。フォルダを設定していない PC ではダウンロード
 * 時間帯のコードは、配送時間帯マスタ（mshktime）の bunrui（配送業者 hscode ごとのコード）。
 * 1 伝票 1 行・見出しなし・Shift_JIS・CRLF（現行と同じ）
 */

/** 配送方法マスタの CSV に使う列 */
export interface HokuriCsv {
  code: string;
  name: string;
  htype: string | null;
  /** 便種コード */
  binshu: string | null;
  /** 元着区分 */
  mtchaku: string | null;
  /** '1' = 代引、'2' = 代引（eコレクト。クレジットも可） */
  daibiki: string | null;
  csvimp: string | null;
  /** 佐川の顧客コード / 福通の荷送人コード */
  cuscode: string | null;
  hscode: number | null;
}

/** 配送時間帯マスタ */
export interface HktimeCsv { hscode: number; code: string; bunrui: string | null }

/** CSV にする伝票の値 */
export interface CsvDoc {
  denno: number;
  /** お届け先 */
  to: { adr?: ShipAdr; name: string };
  /** ご依頼主（伝票の依頼主。無ければ空） */
  irai?: { adr?: ShipAdr; name: string };
  okurino: string | null;
  okurisuu: number | null;
  /** yyyy-mm-dd */
  sday: string;
  hday: string | null;
  htime: string | null;
  omemo: string | null;
  daibiki: number | null;
  daibzei: number | null;
  eidome: string | boolean | null;
  eicode: string | null;
  /** 1 行目の明細（記事欄に「商品名 ×数量」を入れる） */
  first?: { gtext: string; suu: number };
}

export type CsvKind = 'PCCS' | 'CLOUD' | 'e飛伝Ⅱ' | 'iSⅡ';
export const CSV_KINDS: CsvKind[] = ['PCCS', 'CLOUD', 'e飛伝Ⅱ', 'iSⅡ'];
/** csvimp: 送り状 CSV を作る値（朝来の出荷 / 本社） */
export const CSVIMP_FOLDER = 'shuk';
export const CSVIMP_HONSHA = '021';

/** 出荷指示フォルダの伝票ごとのファイル名（倉庫の印刷スクリプトは *pccs.csv・*is2.csv を取り込み用フォルダへコピーする。hiden は前の版で作ったものを消すため） */
export function folderCsvName(kind: CsvKind, denno: number): string {
  return denno + (kind == 'iSⅡ' ? 'iS2.csv' : kind == 'e飛伝Ⅱ' ? 'hiden.csv' : 'pccs.csv');
}
/** e飛伝Ⅱ・CLOUD は出荷指示フォルダに入れず、事務の PC に保存して取り込む */
export function isOfficeCsv(kind: CsvKind): boolean {
  return kind == 'e飛伝Ⅱ' || kind == 'CLOUD';
}
/** 事務の PC に保存するファイル名（出荷日ごと。現行の 20260528hiden.csv・20260528CLOUD.csv と同じ） */
export function officeCsvName(kind: CsvKind, sday: string): string {
  return sday.replace(/-/g, '') + (kind == 'CLOUD' ? 'CLOUD.csv' : 'hiden.csv');
}
/** 行の伝票番号（作り直したとき、同じ伝票の前の行を入れ替えるため）。e飛伝Ⅱは 10 列目、CLOUD は 21 列目 */
export function officeCsvDenno(kind: CsvKind, line: string): string {
  return (splitCsv(line)[kind == 'CLOUD' ? 20 : 9] ?? '').trim();
}

/** CSV の 1 行を列に分ける（"…" の中のカンマは区切りにしない） */
function splitCsv(line: string): string[] {
  const ret: string[] = [];
  let cur = '';
  let q = false;
  for (const c of line) {
    if (c == '"') {
      q = !q;
    } else if (c == ',' && !q) {
      ret.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  ret.push(cur);
  return ret;
}

/** この配送方法で作る CSV（作らないときは null） */
export function csvKind(h: HokuriCsv | undefined): CsvKind | null {
  const t = (h?.htype ?? '').trim();
  return (CSV_KINDS as string[]).includes(t) ? t as CsvKind : null;
}

/** Shift_JIS のバイト数（半角 1、全角 2） */
function sjisLen(c: string): number {
  const n = c.charCodeAt(0);
  return n <= 0x7e || (n >= 0xff61 && n <= 0xff9f) ? 1 : 2;
}

/** 現行の Split_Char2: 先頭から len バイトまでと、残り */
export function splitBytes(s: string, len: number): [string, string] {
  let cnt = 0;
  const cs = [...(s ?? '')];
  for (let i = 0; i < cs.length; i++) {
    cnt += sjisLen(cs[i]);
    if (cnt > len) {
      return [cs.slice(0, i).join(''), cs.slice(i).join('')];
    }
  }
  return [cs.join(''), ''];
}

const HANKANA = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
const ZENKANA = 'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';

/** 現行の StrConv(vbWide): 半角英数記号・半角カナを全角にする */
export function toWide(s: string): string {
  let out = '';
  const cs = [...(s ?? '')];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const n = c.charCodeAt(0);
    if (n == 0x20) {
      out += '　';
    } else if (n >= 0x21 && n <= 0x7e) {
      out += String.fromCharCode(n + 0xfee0);
    } else if (c == '｡' || c == '｢' || c == '｣' || c == '､' || c == '･') {
      out += { '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・' }[c];
    } else if (HANKANA.includes(c)) {
      let z = ZENKANA[HANKANA.indexOf(c)];
      const next = cs[i + 1];
      if (next == 'ﾞ' && 'カキクケコサシスセソタチツテトハヒフヘホウ'.includes(z)) {
        z = z == 'ウ' ? 'ヴ' : String.fromCharCode(z.charCodeAt(0) + 1);
        i++;
      } else if (next == 'ﾟ' && 'ハヒフヘホ'.includes(z)) {
        z = String.fromCharCode(z.charCodeAt(0) + 2);
        i++;
      }
      out += z;
    } else if (c == 'ﾞ') {
      out += '゛';
    } else if (c == 'ﾟ') {
      out += '゜';
    } else {
      out += c;
    }
  }
  return out;
}

const ymd = (d: string | null | undefined): string => (d ?? '').replace(/-/g, '').slice(0, 8);
const nz = (v: unknown): string => v == null ? '' : String(v).trim();
/** 改行・カンマ・引用符は CSV を壊すので空白などにする（現行は Excel のセルの値をそのまま書いていた） */
const clean = (v: unknown): string => nz(v).replace(/[\r\n,]+/g, ' ').replace(/"/g, '”');
const pad2 = (v: string): string => v.length == 1 ? '0' + v : v;

/** 住所を 3 行（各 32 バイトまで。あふれは次の行へ。3 行目はそのまま）にする */
function adr3(a?: ShipAdr): [string, string, string] {
  const l1 = clean([a?.region, a?.local, a?.street].filter(e => e).join(''));
  const [a1, r1] = splitBytes(l1, 32);
  const [a2, r2] = splitBytes(r1 + clean(a?.extend), 32);
  return [a1, a2, r2 + clean(a?.extend2)];
}

/** 郵便番号（ハイフンなし） */
const zip = (a?: ShipAdr): string => nz(a?.zip).replace(/-/g, '');
/** 電話番号 */
const tel = (a?: ShipAdr): string => clean(a?.tel);
const toName = (d: CsvDoc): string => clean(d.to.adr?.adrname || d.to.name);

/** 時間帯のコード（配送業者ごと）。指定なしは '00' */
function timeCode(d: CsvDoc, h: HokuriCsv, times: HktimeCsv[]): string {
  const t = times.find(e => e.hscode == h.hscode && nz(e.code) == nz(d.htime));
  const b = nz(t?.bunrui);
  return b == '' || Number(b) == 0 ? '00' : pad2(b);
}

/** 送り状備考の 1 行目・2 行目 */
function omemo(d: CsvDoc): [string, string] {
  const ls = (d.omemo ?? '').split(/\r?\n/).map(e => clean(e));
  return [ls[0] ?? '', ls.slice(1).filter(e => e).join(' ')];
}

const eidome = (d: CsvDoc): string => d.eidome === true || nz(d.eidome) == '1' || nz(d.eidome).toLowerCase() == 'true' ? '1' : '0';
const firstLine = (d: CsvDoc, sep: string): string => d.first ? clean(d.first.gtext) + sep + d.first.suu : '';

/** 佐川 BizLogi Depo（PCCS）・Cloud（CLOUD）。現行の Edit_Csv_PccsWeb */
export function csvPccs(d: CsvDoc, h: HokuriCsv, times: HktimeCsv[], today: string): string {
  const cloud = h.htype == 'CLOUD';
  const [a1, a2, a3] = adr3(d.to.adr);
  let s = ',';                                            // 1 お届け先コード
  s += zip(d.to.adr) + ',"';                              // 2 郵便番号
  s += a1 + '","';                                        // 3 住所1
  s += a2 + '","';                                        // 4 住所2
  s += a3 + '","';                                        // 5 住所3
  s += toName(d) + '",';                                  // 6 お届け先名1
  s += ',';                                               // 7 お届け先名2
  s += tel(d.to.adr) + ',"';                              // 8 電話
  s += '",';                                              // 9 メールアドレス
  if (!d.irai) {
    s += ',,,,,,,';                                       // 10-16 代行ご依頼主（なし）
  } else {
    const [i1, i2] = splitBytes(clean([d.irai.adr?.region, d.irai.adr?.local, d.irai.adr?.street, d.irai.adr?.extend, d.irai.adr?.extend2].filter(e => e).join('')), 32);
    s += zip(d.irai.adr) + ',';                           // 10 郵便番号
    s += i1 + ',';                                        // 11 住所1
    s += splitBytes(i2, 32)[0] + ',';                     // 12 住所2
    const [n1, n2] = splitBytes(clean(d.irai.adr?.adrname || d.irai.name), 32);
    s += n1 + ',';                                        // 13 名1
    s += splitBytes(n2, 32)[0] + ',';                     // 14 名2
    s += tel(d.irai.adr) + ',';                           // 15 電話
    s += ',';                                             // 16 メールアドレス
  }
  s += nz(h.cuscode) + ',';                               // 17 佐川急便顧客コード
  s += nz(d.okurino) + ',';                               // 18 問い合せ№
  s += (ymd(d.sday) < ymd(today) ? ymd(today) : ymd(d.sday)) + ',';  // 19 発送日（過ぎていれば今日）
  s += nz(d.okurisuu || 1) + ',';                         // 20 個数
  s += d.denno + ',';                                     // 21 顧客管理番号（伝票番号）
  s += nz(h.binshu) + ',';                                // 22 便種コード
  s += ymd(d.hday) + ',';                                 // 23 配達指定日
  s += timeCode(d, h, times) + ',';                       // 24 時間帯コード
  if (nz(h.daibiki) != '') {
    s += nz(d.daibiki ?? 0) + ',' + nz(d.daibzei ?? 0) + ',';  // 25 代引金額 26 代引消費税
  } else {
    s += '0,0,';
  }
  s += '0,';                                              // 27 保険金額
  s += nz(h.mtchaku) + ',';                               // 28 元着区分
  s += eidome(d) + ',';                                   // 29 営止め区分
  s += clean(d.eicode) + ',';                             // 30 営止精算店コード
  s += '999,';                                            // 31 営止精算店ローカルコード
  const [m1, m2] = omemo(d);
  let c = splitBytes(m1, 32);
  s += c[0] + ',' + c[1] + ',';                           // 32-33 記事欄01-02（送り状備考 1 行目）
  c = splitBytes(m2, 32);
  s += c[0] + ',' + c[1] + ',';                           // 34-35 記事欄03-04（送り状備考 2 行目）
  c = splitBytes(firstLine(d, ' ×'), 32);
  s += c[0] + ',' + c[1] + ',';                           // 36-37 記事欄05-06（1 明細目の商品名 ×数量）
  s += cloud ? '1,1,' : ',,';                             // 38-39 Cloud: 消費税区分 1（内税）・ケアマーク 1
  s += ',,,,';                                            // 40-43 記事欄09-12
  return s;
}

/** e飛伝Ⅱ の指定シール②（時間帯） */
const HIDEN_SEAL: Record<string, string> = { '01': '020', '12': '022', '14': '023', '16': '024', '18': '025', '04': '021', '19': '026' };

/** 佐川 e飛伝Ⅱ。現行の Edit_Csv_eHiden（お客様管理ナンバーは伝票番号） */
export function csvHiden(d: CsvDoc, h: HokuriCsv, times: HktimeCsv[]): string {
  const [a1, a2, a3] = adr3(d.to.adr);
  let s = ',,';                                           // 1-2 お届け先コード取得区分・住所録コード
  s += tel(d.to.adr) + ',';                               // 3 電話
  s += zip(d.to.adr) + ',';                               // 4 郵便番号
  s += a1 + ',' + a2 + ',' + a3 + ',';                    // 5-7 住所1-3
  s += toName(d) + ',';                                   // 8 名称1
  s += ',';                                               // 9 名称2
  s += d.denno + ',';                                     // 10 お客様管理ナンバー
  s += nz(h.cuscode) + ',';                               // 11 お客様コード
  s += ',,,';                                             // 12-14 部署・担当者
  if (d.irai) {
    const it = tel(d.irai.adr);
    const [i1, i2] = splitBytes(clean([d.irai.adr?.region, d.irai.adr?.local, d.irai.adr?.street, d.irai.adr?.extend, d.irai.adr?.extend2].filter(e => e).join('')), 32);
    const [n1, n2] = splitBytes(clean(d.irai.adr?.adrname || d.irai.name), 32);
    s += it + ',,,';                                      // 15 荷送人電話 16-17
    s += it + ',';                                        // 18 ご依頼主電話
    s += nz(d.irai.adr?.zip) + ',';                       // 19 郵便番号
    s += i1 + ',' + splitBytes(i2, 32)[0] + ',';          // 20-21 住所1-2
    s += n1 + ',' + splitBytes(n2, 32)[0] + ',';          // 22-23 名称1-2
  } else {
    s += ',,,,,,,,,';
  }
  s += ',';                                               // 24 荷姿コード
  // 送り状備考 1・2 行目を全角にして、品名 1〜3 に
  const [m1, m2] = omemo(d);
  const b1 = toWide(m1), b2 = toWide(m2);
  if (b1.length > 16) {
    const c1 = splitBytes(b1, 32);
    s += c1[0] + ',';                                     // 25 品名1
    if (b2.length > 16) {
      const c2 = splitBytes(c1[1] + b2, 32);
      s += c2[0] + ',' + c2[1] + ',';                     // 26-27 品名2-3
    } else {
      s += c1[1] + ',' + b2 + ',';
    }
  } else {
    const c2 = splitBytes(b2, 32);
    s += b1 + ',' + c2[0] + ',' + c2[1] + ',';            // 25-27
  }
  const g1 = splitBytes(toWide(firstLine(d, '×')), 32);
  const g2 = splitBytes(g1[1], 32);
  s += g1[0] + ',' + g2[0] + ',';                         // 28-29 品名4-5（1 明細目の商品名×数量）
  s += ',,,,,,,,,,,,';                                    // 30-41
  s += nz(d.okurisuu || 1) + ',';                         // 42 出荷個数
  s += nz(h.binshu) + ',';                                // 43 便種（スピード）
  s += ',';                                               // 44 便種（商品）
  s += ymd(d.hday) + ',';                                 // 45 配達日
  const tc = timeCode(d, h, times);
  s += tc + ',';                                          // 46 配達指定時間帯
  s += ',';                                               // 47 配達指定時間（自分）
  const dk = nz(h.daibiki);
  if (dk == '2') {
    s += nz(d.daibiki ?? 0) + ',' + nz(d.daibzei ?? 0) + ',1,';   // 48 代引金額 49 消費税 50 決済種別 1:全て可
  } else if (dk != '') {
    s += nz(d.daibiki ?? 0) + ',' + nz(d.daibzei ?? 0) + ',2,';   // 50 決済種別 2:現金のみ
  } else {
    s += '0,0,0,';
  }
  s += ',';                                               // 51 保険金額
  s += '011,';                                            // 52 指定シール①（取扱注意）
  if (tc != '00') {
    s += (HIDEN_SEAL[tc] ?? '') + ',';                    // 53 指定シール②（時間帯）
  } else if (d.hday) {
    s += '005,';                                          //    指定日配達
  } else if (eidome(d) == '1') {
    s += '004,';                                          //    営業所受取
  } else {
    s += ',';
  }
  s += (dk == '2' ? '010' : dk != '' ? '008' : '') + ','; // 54 指定シール③（eコレクト）
  s += eidome(d) + ',';                                   // 55 営業店止め
  s += ',';                                               // 56 SRC区分
  s += clean(d.eicode) + ',';                             // 57 営業店コード
  s += nz(h.mtchaku);                                     // 58 元着区分
  s += ',,,,,,,,,,,,,,,,';                                // 59-74
  return s;
}

/** 福山通運 iSⅡ。現行の Edit_Csv_is2 */
export function csvIs2(d: CsvDoc, h: HokuriCsv, times: HktimeCsv[]): string {
  const [a1, a2, a3] = adr3(d.to.adr);
  let s = ',';                                            // 1 荷受人コード
  s += tel(d.to.adr) + ',';                               // 2 電話
  s += a1 + ',' + a2 + ',' + a3 + ',';                    // 3-5 住所1-3
  s += toName(d) + ',';                                   // 6 名称1
  s += ',';                                               // 7 名称2
  s += zip(d.to.adr) + ',';                               // 8 郵便番号
  s += ',,';                                              // 9 特殊計 10 着店コード
  s += nz(h.cuscode) + ',';                               // 11 荷送人コード
  s += ',';                                               // 12 荷送担当者
  s += nz(d.okurisuu || 1) + ',';                         // 13 個数
  s += ',,';                                              // 14 才数 15 重量
  const tc = timeCode(d, h, times);
  s += tc == '00' ? ',,' : '100,1' + tc + ',';            // 16-17 輸送商品1・2（時間指定）
  const [m1, m2] = omemo(d);
  const b1 = toWide(m1), b2 = toWide(m2);
  if (b1.length > 16) {
    const c1 = splitBytes(b1, 32);
    s += c1[0] + ',';                                     // 18 品名1
    if (b2.length > 16) {
      const c2 = splitBytes(c1[1] + b2, 32);
      s += c2[0] + ',' + c2[1] + ',';                     // 19-20
    } else {
      s += c1[1] + ',' + b2 + ',';
    }
  } else {
    const c2 = splitBytes(b2, 32);
    s += b1 + ',' + c2[0] + ',' + c2[1] + ',';            // 18-20
  }
  const g1 = splitBytes(toWide(firstLine(d, '×')), 32);
  const g2 = splitBytes(g1[1], 32);
  s += g1[0] + ',' + g2[0] + ',' + g2[1] + ',';           // 21-23 品名記事4-6（1 明細目の商品名×数量）
  s += ymd(d.hday) + ',';                                 // 24 配達指定日
  s += '1,';                                              // 25 必着区分
  s += String(d.denno).padStart(8, ' ') + ',';            // 26 お客様管理番号
  s += '1,';                                              // 27 元払区分
  s += '0,';                                              // 28 保険金額
  s += ymd(d.sday) + ',';                                 // 29 出荷日付
  return s;                                               // 30 登録日付（空 = 実行日）
}

/** 伝票 1 件の CSV の行 */
export function csvLine(kind: CsvKind, d: CsvDoc, h: HokuriCsv, times: HktimeCsv[], today: string): string {
  return kind == 'iSⅡ' ? csvIs2(d, h, times) : kind == 'e飛伝Ⅱ' ? csvHiden(d, h, times) : csvPccs(d, h, times, today);
}
