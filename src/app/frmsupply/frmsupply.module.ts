import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';
import localeJa from '@angular/common/locales/ja';

import { FrmsupplyRoutingModule } from './frmsupply-routing.module';
import { FrmsupplyComponent } from './frmsupply.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { HmeitblComponent } from './hmeitbl.component';
// import { VcdhelpComponent } from '../share/vcdhelp/vcdhelp.component';

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    FrmsupplyComponent,
    HmeitblComponent,
    // VcdhelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsupplyRoutingModule
  ],
  providers: [BeforeunloadGuard ,{ provide: LOCALE_ID, useValue: 'ja-JP' }],
})
export class FrmsupplyModule { }
