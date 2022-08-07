import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrminvoiceRoutingModule } from './frminvoice-routing.module';
import { FrminvoiceComponent } from './frminvoice.component';
import { JdentblComponent } from './jdentbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';


@NgModule({
  declarations: [
    FrminvoiceComponent,
    JdentblComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrminvoiceRoutingModule
  ],
  providers: [BeforeunloadGuard]
})
export class FrminvoiceModule { }
