import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmsalesRoutingModule } from './frmsales-routing.module';
import { FrmsalesComponent } from './frmsales.component';
import { JmeitblComponent } from './jmeitbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
// import { UserService } from './../services/user.service';


@NgModule({
  declarations: [
    FrmsalesComponent,
    JmeitblComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsalesRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmsalesModule { }
