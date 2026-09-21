import { Injectable, ElementRef, inject } from '@angular/core';
import * as FileSaver from 'file-saver';
import * as json2csv from 'json2csv';
import { HttpClient } from '@angular/common/http';
import { UserService } from './user.service';

export class Result {
  zipcode!: string;
  prefcode!: string;
  address1!: string;
  address2!: string;
  address3!: string;
  kana1!: string;
  kana2!: string;
  kana3!: string;
  constructor(init?: Partial<Result>) {
    Object.assign(this, init);
  }
}

class ZipAdr {
  status!: string;
  message!: string;
  result!: Result[];
  constructor(init?: Partial<ZipAdr>) {
    Object.assign(this, init);
  }
}

/** 郵便番号検索 API（zipcloud）の応答。該当なしのとき results は null（呼び出し側は従来どおり確認していない） */
export interface ZipcloudResponse {
  status: number;
  message: string | null;
  results: { zipcode: string; address1: string; address2: string; address3: string }[];
}
@Injectable({
  providedIn: 'root'
})
export class DownloadService {
  usrsrv = inject(UserService);
  private http = inject(HttpClient);


  pickObj<T extends object>(obj: T, flds: string[]): Partial<T> {
    let pickobj: Record<string, unknown> = {};
    flds.forEach(e => pickobj[e] = (obj as Record<string, unknown>)[e]);
    return pickobj as unknown as Partial<T>; // 指定した項目だけを取り出した部分オブジェクト
  }

  pickObjArr<T extends object>(objarr: T[], flds: string[]): Partial<T>[] {
    let pickarr: Partial<T>[] = [];
    objarr.forEach((obj) => {
      pickarr.push(this.pickObj(obj, flds));
    });
    return pickarr;
  }

  dlKick(pformat: string, pelRef: ElementRef) {
    const link: HTMLAnchorElement = pelRef.nativeElement.querySelector('#csv-donwload') as HTMLAnchorElement;
    // console.log(link);
    link.href = pformat;
    link.click();
  }
  dlCsv(data: object | object[], pcsv: string) {
    const blob = new Blob([json2csv.parse(data)], { type: 'text/csv' });
    FileSaver.saveAs(blob, pcsv);
  }
  async dlImg(pfnm: string, psrc: string) { //pelRef:ElementRef) {
    // console.log(psrc);
    // const base64 = pelRef.nativeElement.querySelector('qr-code > img').src;
    // const blob = await this.conv64ToBlob(psrc);
    const blob = await this.base64DecodeAsBlob(psrc);
    FileSaver.saveAs(blob, pfnm);

  }

  async dlPng(path: string, pngnm: string, dlfl: string) {
    this.getImg(path, pngnm).then(result => {
      this.base64DecodeAsBlob('data:image/png;base64,' + result).then(blob => {
        FileSaver.saveAs(blob, dlfl);
      });
    }).catch(error => {
      console.log('get_png error', error);
    });
  }

  async base64DecodeAsBlob(text: URL | RequestInfo) {
    // console.log(text);
    return fetch(text).then(response => response.blob());
  }

  private async getImg(path: string, file: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.http.get(this.usrsrv.system.imgurl + 'index.php?topath=./' + path + '/&func=img&file=' + file, { responseType: 'text' })
        .subscribe(
          data => { return resolve(data) },
          error => { return reject(error) }
        );
    });
  }

  async getAdr(zipcode: string): Promise<ZipcloudResponse> {
    return new Promise<ZipcloudResponse>((resolve, reject) => {
      this.http.get<ZipcloudResponse>('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + zipcode)
        .subscribe(
          data => {
            // return resolve(JSON.stringify(data))
            return resolve(data)
          },
          error => { return reject(error) }
        );
    });
  }
}