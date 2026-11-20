import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import localeJa from '@angular/common/locales/ja';
import { CoreModule } from './../core/core.module';
import { ReproyalComponent } from './reproyal.component';
import { RoymstComponent } from './roymst.component';

registerLocaleData(localeJa);

const routes: Routes = [
  { path: '', component: ReproyalComponent },
  { path: 'master', component: RoymstComponent }
];

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule.forChild(routes),
    ReproyalComponent,
    RoymstComponent
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class ReproyalModule { }
