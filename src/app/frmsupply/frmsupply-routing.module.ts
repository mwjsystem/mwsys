import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmsupplyComponent } from './frmsupply.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrmsupplyComponent },
  { path: ':mode/:denno', component: FrmsupplyComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmsupplyRoutingModule { }
