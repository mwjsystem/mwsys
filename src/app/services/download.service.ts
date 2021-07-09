import { Injectable, ElementRef } from '@angular/core';
import * as FileSaver from 'file-saver';
import * as json2csv from 'json2csv';

@Injectable({
  providedIn: 'root'
})
export class DownloadService {

  constructor() { }

  pickObj(obj,flds:string[]){
    let pickobj={};
    flds.forEach(e => pickobj[e]=obj[e]);
    return pickobj;
  }

  pickObjArr(objarr,flds:string[]){
    let pickarr=[];
    objarr.forEach(obj =>{
        let pickobj={};
        flds.forEach(e => pickobj[e]=obj[e]);
        pickarr.push(pickobj);    
    });
    return pickarr;
  }

  dl_kick(data,pcsv:string,pformat:string,pelRef:ElementRef) {
    
    const blob = new Blob([json2csv.parse(data)], { type: 'text/csv' });
    FileSaver.saveAs(blob, pcsv);
    const link: HTMLAnchorElement = pelRef.nativeElement.querySelector('#csv-donwload') as HTMLAnchorElement;
    // console.log(link);
    link.href = pformat;
    link.click();

  }
  dl_csv(data,pcsv:string) {
    
    const blob = new Blob([json2csv.parse(data)], { type: 'text/csv' });
    FileSaver.saveAs(blob, pcsv);

  }

  async dl_img(pfnm:string,psrc:string){ //pelRef:ElementRef) {
    // console.log(psrc);
    // const base64 = pelRef.nativeElement.querySelector('qr-code > img').src;
    const blob = await this.conv64ToBlob(psrc);
    FileSaver.saveAs(blob, pfnm);
  
  }

  dl_png(pflnm:string,psel:string,pelRef:ElementRef,url:string){
    let xhr = new XMLHttpRequest();
    console.log()
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = function(e){
      // console.log(e,this);
      if(this.status == 200){
        let urlUtil = window.URL || window.webkitURL;
        let imgUrl = urlUtil.createObjectURL(this.response);
        const link: HTMLAnchorElement = pelRef.nativeElement.querySelector(psel) as HTMLAnchorElement;
        link.download=pflnm;
        link.click();
      }
    };
    xhr.send();
  }

  private async conv64ToBlob(Base64Image: any) {
    // SPLIT INTO TWO PARTS
    const parts = Base64Image.split(';base64,');
    // HOLD THE CONTENT TYPE
    const imageType = parts[0].split(':')[1];
    // DECODE BASE64 STRING
    const decodedData = window.atob(parts[1]);
    // CREATE UNIT8ARRAY OF SIZE SAME AS ROW DATA LENGTH
    const uInt8Array = new Uint8Array(decodedData.length);
    // INSERT ALL CHARACTER CODE INTO UINT8ARRAY
    for (let i = 0; i < decodedData.length; ++i) {
      uInt8Array[i] = decodedData.charCodeAt(i);
    }
    // RETURN BLOB IMAGE AFTER CONVERSION
    return new Blob([uInt8Array], { type: imageType });
  }  
}
