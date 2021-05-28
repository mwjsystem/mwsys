import { NgModule, LOCALE_ID  } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';

import localeJa from '@angular/common/locales/ja';

import { RepstockRoutingModule } from './repstock-routing.module';
import { RepstockComponent } from './repstock.component';
import { GcdhelpComponent } from '../share/gcdhelp/gcdhelp.component';

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    RepstockComponent,
    GcdhelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    RepstockRoutingModule
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class RepstockModule { }
