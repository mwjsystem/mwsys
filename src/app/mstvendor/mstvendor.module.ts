import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { MstvendorRoutingModule } from './mstvendor-routing.module';
import { MstvendorComponent } from './mstvendor.component';
import { VcdhelpComponent } from '../share/vcdhelp/vcdhelp.component';


@NgModule({
  declarations: [
    MstvendorComponent,
    VcdhelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    MstvendorRoutingModule
  ]
})
export class MstvendorModule { }
