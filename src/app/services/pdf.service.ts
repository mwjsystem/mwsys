import { Injectable } from '@angular/core';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import * as FileSaver from 'file-saver';

type PdfMake = typeof import('pdfmake');

/** 帳票（PDF）で使う日本語フォントのファミリー名 */
export const PDF_FONT = 'NotoSansJP';

/**
 * 帳票（PDF）を作る共通処理。
 * pdfmake と日本語フォント（assets/fonts の Noto Sans JP）は、最初に PDF を作るときにだけ読み込む
 * （通常の画面表示を重くしないため）。PDF にはフォントの使った文字だけが埋め込まれる。
 */
@Injectable({
  providedIn: 'root'
})
export class PdfService {
  private loading?: Promise<PdfMake>;

  /** pdfmake とフォントを読み込む（2 回目以降は読み込み済みのものを返す） */
  private load(): Promise<PdfMake> {
    if (!this.loading) {
      this.loading = (async () => {
        const mod = await import('pdfmake');
        // pdfmake のブラウザ版は CommonJS のため、default に本体が入る場合がある
        const pdfMake = ((mod as unknown as { default?: PdfMake }).default ?? mod) as PdfMake;
        const [regular, bold] = await Promise.all([
          this.fetchBase64('assets/fonts/NotoSansJP-Regular.ttf'),
          this.fetchBase64('assets/fonts/NotoSansJP-Bold.ttf')
        ]);
        pdfMake.addVirtualFileSystem({
          'NotoSansJP-Regular.ttf': regular,
          'NotoSansJP-Bold.ttf': bold
        });
        pdfMake.addFonts({
          [PDF_FONT]: {
            normal: 'NotoSansJP-Regular.ttf',
            bold: 'NotoSansJP-Bold.ttf',
            italics: 'NotoSansJP-Regular.ttf',
            bolditalics: 'NotoSansJP-Bold.ttf'
          }
        });
        return pdfMake;
      })();
      // 失敗したら次回は読み込み直す
      this.loading.catch(() => this.loading = undefined);
    }
    return this.loading;
  }

  private async fetchBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('フォントを読み込めませんでした: ' + url);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  /** 帳票の定義から PDF を作る。フォントの指定が無ければ日本語フォントにする */
  async createPdf(doc: TDocumentDefinitions): Promise<Blob> {
    const pdfMake = await this.load();
    const def: TDocumentDefinitions = {
      ...doc,
      defaultStyle: { font: PDF_FONT, ...doc.defaultStyle }
    };
    return pdfMake.createPdf(def).getBlob();
  }

  /** ファイルとして保存する（ブラウザのダウンロード） */
  download(blob: Blob, fileName: string): void {
    FileSaver.saveAs(blob, this.safeName(fileName));
  }

  /** 複数のファイルを ZIP にまとめて保存する */
  async downloadZip(files: { name: string; blob: Blob }[], zipName: string): Promise<void> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const f of files) {
      zip.file(this.safeName(f.name), f.blob);
    }
    FileSaver.saveAs(await zip.generateAsync({ type: 'blob' }), this.safeName(zipName));
  }

  /** ファイル名に使えない文字を全角に置き換える */
  safeName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)).trim();
  }
}
