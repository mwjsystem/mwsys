import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import localeJa from '@angular/common/locales/ja';
import { CoreModule } from './../core/core.module';
import { RepopelogComponent } from './repopelog.component';

registerLocaleData(localeJa);

const routes: Routes = [
  { path: '', component: RepopelogComponent }
];

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule.forChild(routes),
    RepopelogComponent
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class RepopelogModule { }
