import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmmoveComponent } from './frmmove.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { MovcheckComponent } from './movcheck.component';

const routes: Routes = [
  { path: '', component: FrmmoveComponent },
  // 倉庫のスマホで移動伝票・大会リストの QR を読んで、数量を確認する
  { path: 'check', component: MovcheckComponent },
  { path: 'check/:denno', component: MovcheckComponent },
  { path: ':mode/:denno', component: FrmmoveComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmmoveRoutingModule { }
