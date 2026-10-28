import { Injectable, inject } from '@angular/core';
import { PdfService } from './pdf.service';

/** メーラー（Thunderbird）で作成画面を開くメール 1 件 */
export interface MailerItem {
  /** 伝票番号。添付ファイル名はこの番号で始めること（PC 側で添付の取り違えを確認する） */
  denno: number;
  fileName: string;
  blob: Blob;
  to: string;
  from: string;
  subject: string;
  body: string;
}

/**
 * 添付ファイル付きでメーラー（Thunderbird）の作成画面を開く。
 * ブラウザだけでは添付ファイルを指定してメーラーを起動できないため、各 PC に入れた
 * 「メール作成の初期設定」（assets/mwjmail_setup_v3.cmd。mwjmail: のリンクを PowerShell のスクリプトに結び付ける）を使う。
 * 初期設定のスクリプトを変えたときは、版（スクリプト内の $Version とファイル名）を上げて、古いファイルを実行する取り違えを防ぐ。
 *   1. 添付ファイルと送信内容（mwjmail.json）を ZIP（mwjmail_YYYYMMDDHHMMSS.zip）にしてダウンロードする
 *   2. mwjmail:open?zip=... を開く → PC 側のスクリプトが ZIP を展開し、1 件ずつ Thunderbird の作成画面を開く
 * 送信は、開いた作成画面で担当者が行う。
 */
@Injectable({
  providedIn: 'root'
})
export class MailerService {
  private pdfsrv = inject(PdfService);

  async compose(items: MailerItem[]): Promise<void> {
    const now = new Date();
    const p2 = (n: number) => ('0' + n).slice(-2);
    const stamp = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds());
    const zipName = 'mwjmail_' + stamp + '.zip';
    const manifest = {
      created: now.toISOString(),
      // ZIP に入れるときと同じ置き換えをしたファイル名にする
      mails: items.map(e => ({ denno: e.denno, file: this.pdfsrv.safeName(e.fileName), to: e.to, from: e.from, subject: e.subject, body: e.body }))
    };
    await this.pdfsrv.downloadZip([
      ...items.map(e => ({ name: e.fileName, blob: e.blob })),
      { name: 'mwjmail.json', blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }
    ], zipName);
    // PC 側のスクリプトはダウンロードの完了を待つので、すぐにリンクを開いてよい
    const a = document.createElement('a');
    a.href = 'mwjmail:open?zip=' + encodeURIComponent(zipName);
    a.click();
  }
}
