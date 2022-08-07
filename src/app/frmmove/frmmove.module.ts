import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmmoveRoutingModule } from './frmmove-routing.module';
import { FrmmoveComponent } from './frmmove.component';
import { MovtblComponent } from './movtbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { MdnohelpComponent } from '../share/mdnohelp/mdnohelp.component';


@NgModule({
  declarations: [
    FrmmoveComponent,
    MovtblComponent,
    MdnohelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmmoveRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmmoveModule { }
