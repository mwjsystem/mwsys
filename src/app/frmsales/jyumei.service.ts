import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class JyumeiService {
  public jyumei: mwI.Jyumei[]=[]; //読込時にfrmsales⇒jmeitblコンポーネントへ渡すときのみ使用
  public mtax:string;
  public tankakbn:string;
  public sptnkbn:string;
  public ntype:number;
  public tntype:number;
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  constructor() { }
}
