import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmkeepRoutingModule } from './frmkeep-routing.module';
import { FrmkeepComponent } from './frmkeep.component';

@NgModule({
  declarations: [
    FrmkeepComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmkeepRoutingModule
  ],

})
export class FrmkeepModule { }
