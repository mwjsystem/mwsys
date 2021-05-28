import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';
// import { MatSpinner } from '@angular/material/progress-spinner';

import localeJa from '@angular/common/locales/ja';

import { FrmkeepRoutingModule } from './frmkeep-routing.module';
import { FrmkeepComponent } from './frmkeep.component';
// import { UserService } from './../services/user.service';

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    FrmkeepComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmkeepRoutingModule
  ],
  // entryComponents: [
  //   MatSpinner
  // ],
  providers: [{ provide: LOCALE_ID, useValue: 'ja-JP' }]
})
export class FrmkeepModule { }
