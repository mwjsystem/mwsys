import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmdepositRoutingModule } from './frmdeposit-routing.module';
import { FrmdepositComponent } from './frmdeposit.component';
import { DepttblComponent } from './depttbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { JdentblComponent } from './jdentbl.component';


@NgModule({
  declarations: [
    FrmdepositComponent,
    DepttblComponent,
    JdentblComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmdepositRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmdepositModule { }
