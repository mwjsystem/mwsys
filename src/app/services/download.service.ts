import { Injectable, ElementRef } from '@angular/core';
import * as FileSaver from 'file-saver';
import * as json2csv from 'json2csv';
import { HttpClient } from '@angular/common/http';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class DownloadService {

  constructor(public usrsrv: UserService,
              private http: HttpClient) { }

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

  dl_kick(pformat:string,pelRef:ElementRef) {
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
    // const blob = await this.conv64ToBlob(psrc);
    const blob = await this.base64DecodeAsBlob(psrc);
    FileSaver.saveAs(blob, pfnm);
  
  }

  async dl_png(path:string,pngnm:string,dlfl:string){
    this.get_img(path,pngnm).then(result => {
      this.base64DecodeAsBlob('data:image/png;base64,' + result).then( blob => {
        FileSaver.saveAs(blob, dlfl);
      });
    }).catch(error => {
      console.log('get_png error', error);
    });
  }

  async base64DecodeAsBlob(text) {
    // console.log(text);
    return fetch(text).then(response => response.blob());
  } 

  private async get_img(path:string,file:string):Promise<any>{
    return new Promise( (resolve,reject) => {
      this.http.get(this.usrsrv.system.imgurl + 'index.php?topath=./' + path + '/&func=img&file=' + file, {responseType: 'text'})
        .subscribe(
          data =>  {return resolve(data)},
          error => {return reject(error)}
        );
    });  
  }

  // private async conv64ToBlob(Base64Image: any) {
  //   // SPLIT INTO TWO PARTS
  //   const parts = Base64Image.split(';base64,');
  //   // HOLD THE CONTENT TYPE
  //   const imageType = parts[0].split(':')[1];
  //   // DECODE BASE64 STRING
  //   const decodedData = window.atob(parts[1]);
  //   // CREATE UNIT8ARRAY OF SIZE SAME AS ROW DATA LENGTH
  //   const uInt8Array = new Uint8Array(decodedData.length);
  //   // INSERT ALL CHARACTER CODE INTO UINT8ARRAY
  //   for (let i = 0; i < decodedData.length; ++i) {
  //     uInt8Array[i] = decodedData.charCodeAt(i);
  //   }
  //   // RETURN BLOB IMAGE AFTER CONVERSION
  //   return new Blob([uInt8Array], { type: imageType });
  // }  
}
