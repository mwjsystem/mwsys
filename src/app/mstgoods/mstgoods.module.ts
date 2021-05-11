import { NgModule, LOCALE_ID  } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';
import localeJa from '@angular/common/locales/ja';

import { MstgoodsRoutingModule } from './mstgoods-routing.module';
import { MstgoodsComponent } from './mstgoods.component';
import { GtnktblComponent } from './gtnktbl.component';
import { GdstblComponent } from './gdstbl.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    MstgoodsComponent,
    GtnktblComponent,
    GdstblComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    MstgoodsRoutingModule
  ],
  providers: [BeforeunloadGuard ,{ provide: LOCALE_ID, useValue: 'ja-JP' }],
})
export class MstgoodsModule { }
