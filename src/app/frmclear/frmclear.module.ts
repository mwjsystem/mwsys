import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmclearRoutingModule } from './frmclear-routing.module';
import { FrmclearComponent } from './frmclear.component';
import { BeforeunloadGuard } from './../beforeunload.guard';


@NgModule({
  declarations: [
    FrmclearComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmclearRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmclearModule { }
