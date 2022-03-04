import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Edahlp {
  eda: number;
  zip: string;
  region: string;
  local: string;
  street: string;
  extend: string;
  extend2: string;
  adrname: string;
  tel: string;
}

@Injectable({
  providedIn: 'root'
})
export class EdaService {
  public mcode: string;
  public edas: Edahlp[] = [];
  public selro: Edahlp;
  public adrs: mwI.Adrs[] = [];
  public subject = new Subject<Edahlp[]>();
  public observe = this.subject.asObservable();
  constructor() { }

  get_name(eda: number): string {
    let ret: string = "";
    const i: number = this.adrs.findIndex(obj => obj.eda == eda);
    if (i > 1) {
      ret = this.adrs[i].adrname;
    }
    return ret;
  }

  updateAdrs(padrs, mode: number) {
    if (mode == 1) {
      this.adrs.push(padrs);
    } else if (mode == 2) {
      const i: number = this.adrs.findIndex(obj => obj.eda == padrs.eda);
      this.adrs[i] = padrs;
    }
  }

}
