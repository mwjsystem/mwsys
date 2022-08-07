import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmdepositRoutingModule } from './frmdeposit-routing.module';
import { FrmdepositComponent } from './frmdeposit.component';
import { DepttblComponent } from './depttbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { HisttblComponent } from './histtbl.component';
import { NdnohelpComponent } from '../share/ndnohelp/ndnohelp.component';


@NgModule({
  declarations: [
    FrmdepositComponent,
    DepttblComponent,
    HisttblComponent,
    NdnohelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmdepositRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmdepositModule { }
