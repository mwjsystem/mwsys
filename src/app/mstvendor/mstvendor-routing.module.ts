import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MstvendorComponent } from './mstvendor.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: MstvendorComponent},
  { path: ':mode/:vcd', component: MstvendorComponent, canDeactivate: [BeforeunloadGuard] }
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MstvendorRoutingModule { }
