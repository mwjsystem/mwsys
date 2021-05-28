import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmtreatComponent } from './frmtreat.component';

const routes: Routes = [
  { path: '', component: FrmtreatComponent },
  // { path: ':param', component: FrmtreatComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmtreatRoutingModule { }
