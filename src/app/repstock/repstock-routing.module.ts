import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RepstockComponent } from './repstock.component';

const routes: Routes = [
  { path: '', component: RepstockComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RepstockRoutingModule { }
