import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmsupplyRoutingModule } from './frmsupply-routing.module';
import { FrmsupplyComponent } from './frmsupply.component';
import { HmeitblComponent } from './hmeitbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { HdnohelpComponent } from '../share/hdnohelp/hdnohelp.component';


@NgModule({
  declarations: [
    FrmsupplyComponent,
    HmeitblComponent,
    HdnohelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsupplyRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmsupplyModule { }
