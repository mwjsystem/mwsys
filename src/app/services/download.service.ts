import { Injectable, ElementRef } from '@angular/core';
import * as FileSaver from 'file-saver';
import * as json2csv from 'json2csv';

@Injectable({
  providedIn: 'root'
})
export class DownloadService {

  constructor() { }

  dl_kick(data,pcsv:string,pformat:string,pelRef:ElementRef) {
    
    // // CSV ファイルは `UTF-8 BOM有り` で出力する
    // // そうすることで Excel で開いたときに文字化けせずに表示できる
    // const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    // CSVファイルを出力するために Blob 型のインスタンスを作る
    // csvデータは同期処理で取得
    // console.log("Json前",data);
    // const fields = ['denno', 'uday', 'mcode','mtbl'];
    const blob = new Blob([json2csv.parse(data,{unwind:'mtbl'})], { type: 'text/csv' });
    // const url = window.URL.createObjectURL(blob);

    FileSaver.saveAs(blob, pcsv);

    const link: HTMLAnchorElement = pelRef.nativeElement.querySelector('#csv-donwload') as HTMLAnchorElement;
    console.log(link);
    link.href = 'Mwjexe://' + pformat;
    link.click();

  }
  dl_csv(data,pcsv:string) {
    
    // // CSV ファイルは `UTF-8 BOM有り` で出力する
    // // そうすることで Excel で開いたときに文字化けせずに表示できる
    // const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    // CSVファイルを出力するために Blob 型のインスタンスを作る
    // csvデータは同期処理で取得
    // console.log("Json前",data);
    // const fields = ['denno', 'uday', 'mcode','mtbl'];
    const blob = new Blob([json2csv.parse(data,{unwind:'mtbl'})], { type: 'text/csv' });
    // const url = window.URL.createObjectURL(blob);

    FileSaver.saveAs(blob, pcsv);

    // const link: HTMLAnchorElement = pelRef.nativeElement.querySelector('#csv-donwload') as HTMLAnchorElement;
    // console.log(link);
    // link.href = 'Mwjexe://' + pformat;
    // link.click();

  }
}
