import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import localeJa from '@angular/common/locales/ja';
import { CoreModule } from './../core/core.module';
import { FrmtkdComponent } from './frmtkd.component';

registerLocaleData(localeJa);

const routes: Routes = [
  { path: '', component: FrmtkdComponent, data: { kind: 'tkd' } },
  { path: 'th', component: FrmtkdComponent, data: { kind: 'th' } }
];

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule.forChild(routes),
    FrmtkdComponent
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class FrmtkdModule { }
