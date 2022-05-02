import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FrminvoiceRoutingModule } from './frminvoice-routing.module';
import { FrminvoiceComponent } from './frminvoice.component';


@NgModule({
  declarations: [
    FrminvoiceComponent
  ],
  imports: [
    CommonModule,
    FrminvoiceRoutingModule
  ]
})
export class FrminvoiceModule { }
