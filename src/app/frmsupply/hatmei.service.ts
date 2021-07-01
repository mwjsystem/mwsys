import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class HatmeiService {
  public hatmei: mwI.Hatmei[]=[]; //読込時にfrmsupply⇒hmeitblコンポーネントへ渡すときのみ使用
  // public subject = new Subject<mwI.Hatmei[]>();
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  constructor() { }
  get_hdsta(hmei):string {
    let flg0:boolean=false;//発注済
    let flg1:boolean=false;//入荷予定あり
    let flg2:boolean=false;//入荷確定あり
    let flg3:boolean=false;//仕入済あり
    let ret:string="";

    hmei.forEach(e => {
      if(e.inday){
        flg3=true;
      }else if(e.yday && e.ydaykbn=='0'){
        flg2=true;
      }else if(e.yday && e.ydaykbn=='1'){
        flg1=true;
      }else{
        flg0=true;
      } 
    });
    if(flg3 && !flg2 && !flg1 && !flg0){
      ret='5';
    }else if(flg3 && (flg2 || flg1 || flg0)){
      ret='4';
    }else if(flg2 && !flg1 && !flg0){
      ret='3';
    }else if(flg2 && (flg1 || flg0)){
      ret='2';
    }
    return ret;
  }
}
