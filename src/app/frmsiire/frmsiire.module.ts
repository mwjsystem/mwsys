import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmsiireRoutingModule } from './frmsiire-routing.module';
import { FrmsiireComponent } from './frmsiire.component';
import { SimeitblComponent } from './simeitbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { SdnohelpComponent } from '../share/sdnohelp/sdnohelp.component';
import { HmeihelpComponent } from '../share/hmeihelp/hmeihelp.component';


@NgModule({
  declarations: [
    FrmsiireComponent,
    SimeitblComponent,
    SdnohelpComponent,
    HmeihelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsiireRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmsiireModule { }
