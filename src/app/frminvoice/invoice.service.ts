import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  total: number = 0;
  mode: number = 3;

  constructor() { }
}
