import { Injectable, ElementRef, inject } from '@angular/core';
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

/** 郵便番号検索 API（zipcloud）の応答。該当なしのとき results は null */
export interface ZipcloudResponse {
  status: number;
  message: string | null;
  results: { zipcode: string; address1: string; address2: string; address3: string }[] | null;
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