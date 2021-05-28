import { NgModule, LOCALE_ID  } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';

import localeJa from '@angular/common/locales/ja';

import { FrmtreatRoutingModule } from './frmtreat-routing.module';
import { FrmtreatComponent } from './frmtreat.component';
import { TrtdetailComponent } from './trtdetail.component';
// import { UserService } from './../services/user.service';

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    FrmtreatComponent,
    TrtdetailComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmtreatRoutingModule
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class FrmtreatModule { }
