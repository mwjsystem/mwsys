import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TreatService {
  public trts: mwI.Trtreat[]=[];
  public subject = new Subject<mwI.Trtreat[]>();
  public observe = this.subject.asObservable();
  
  constructor() { }
}
