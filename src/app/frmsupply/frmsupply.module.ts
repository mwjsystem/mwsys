import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmsupplyRoutingModule } from './frmsupply-routing.module';
import { FrmsupplyComponent } from './frmsupply.component';
import { HmeitblComponent } from './hmeitbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';


@NgModule({
  declarations: [
    FrmsupplyComponent,
    HmeitblComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsupplyRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmsupplyModule { }
