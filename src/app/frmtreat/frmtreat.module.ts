import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';
import { BeforeunloadGuard } from './../beforeunload.guard';

import { FrmtreatRoutingModule } from './frmtreat-routing.module';
import { FrmtreatComponent } from './frmtreat.component';
import { TrtdetailComponent } from './trtdetail.component';

@NgModule({
  declarations: [
    FrmtreatComponent,
    TrtdetailComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmtreatRoutingModule
  ],
  providers: [BeforeunloadGuard]
})
export class FrmtreatModule { }
