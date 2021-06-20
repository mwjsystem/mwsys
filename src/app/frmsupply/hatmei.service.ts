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
}
