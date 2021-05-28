import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';
import localeJa from '@angular/common/locales/ja';

import { FrmsalesRoutingModule } from './frmsales-routing.module';
import { FrmsalesComponent } from './frmsales.component';
import { JmeitblComponent } from './jmeitbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
// import { UserService } from './../services/user.service';

registerLocaleData(localeJa);

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
  providers: [BeforeunloadGuard ,{ provide: LOCALE_ID, useValue: 'ja-JP' }],
})
export class FrmsalesModule { }
