import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import localeJa from '@angular/common/locales/ja';
import { CoreModule } from './../core/core.module';
import { RepcheckComponent } from './repcheck.component';

registerLocaleData(localeJa);

const routes: Routes = [
  { path: '', component: RepcheckComponent }
];

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule.forChild(routes),
    RepcheckComponent
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class RepcheckModule { }
