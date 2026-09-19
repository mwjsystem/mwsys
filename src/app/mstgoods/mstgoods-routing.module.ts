import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MstgoodsComponent } from './mstgoods.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: MstgoodsComponent },
  { path: ':mode', component: MstgoodsComponent, canDeactivate: [BeforeunloadGuard] },
  { path: ':mode/:grpcd', component: MstgoodsComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MstgoodsRoutingModule { }
