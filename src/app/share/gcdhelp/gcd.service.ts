import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

 export interface Gcd {
    code:string;
    gcode:string;
    gtext:string;
    size:string;
    color:string;
    jan:string;
    irisu:number;
    iriunit:string;
    gskbn:number;
    tkbn:number;
    zkbn:number;
  }

@Injectable({
  providedIn: 'root'
})
export class GcdService {

  public gcds:Gcd[];
  
  
  constructor() { }
}
