import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Mcd {
  mcode:string;
  sei:string;
  mei:string;
  kana:string;
  mail:string;
  tcode1:string;
  tcode2:string;
  eda:number;
  zip:string;
  region:string;
  local:string;
  street:string;
  extend:string;
  extend2:string;
  adrname:string;
  tel:string;
}

@Injectable({
  providedIn: 'root'
})
export class McdService {
  public mcds: Mcd[]=[];
  public selro: Mcd;
  // public filtx: string;
  public subject = new Subject<Mcd[]>();
  public observe = this.subject.asObservable();
  constructor() { }

  set_mail(m1:string,m2:string,m3:string,m4:string,m5:string):string{
    let mail:string="";
    if (m1 !== null) {
      mail += m1 + "/";
    }
    if (m2 !== null) {
      mail += m2 + "/";
    }
    if (m3 !== null) {
      mail += m3 + "/";
    }
    if (m4 !== null) {
      mail += m4 + "/";
    }
    if (m5 !== null) {
      mail += m5 + "/";
    }
    return (mail || "").slice( 0, -1 );
  }

  set_tel(t1:string,t2:string,t3:string,fax:string):string{
    let tel:string="";
    if (t1 !== null) {
      tel += t1 + "/";
    }
    if (t2 !== null) {
      tel += t2 + "/";
    }
    if (t3 !== null) {
      tel += t3 + "/";
    }
    if (fax !== null) {
      tel += fax + "/";
    }
    return (tel || "").slice( 0, -1 );
  }
}
