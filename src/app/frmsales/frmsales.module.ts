import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { FrmsalesRoutingModule } from './frmsales-routing.module';
import { FrmsalesComponent } from './frmsales.component';
import { JmeitblComponent } from './jmeitbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { JdnohelpComponent } from '../share/jdnohelp/jdnohelp.component';
import { SpdethelpComponent } from '../share/spdethelp/spdethelp.component';
import { JmzaitblComponent } from './jmzaitbl.component';
// import { UserService } from './../services/user.service';


@NgModule({
  declarations: [
    FrmsalesComponent,
    JmeitblComponent,
    JdnohelpComponent,
    SpdethelpComponent,
    JmzaitblComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsalesRoutingModule
  ],
  providers: [BeforeunloadGuard],
})
export class FrmsalesModule { }
