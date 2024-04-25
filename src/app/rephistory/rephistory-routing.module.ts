import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RephistoryComponent } from './rephistory.component';

const routes: Routes = [
  { path: '', component: RephistoryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RephistoryRoutingModule { }
