import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class JyumeiService {
  public jyumei: mwI.Jyumei[]=[];
  public subject = new Subject<mwI.Jyumei[]>();
  public observe = this.subject.asObservable();
  constructor() { }
}
