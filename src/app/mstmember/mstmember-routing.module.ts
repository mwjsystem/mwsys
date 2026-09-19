import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MstmemberComponent } from './mstmember.component';
import { BeforeunloadGuard } from './../beforeunload.guard';


const routes: Routes = [
  { path: '', component: MstmemberComponent },
  { path: ':mode/:mcd', component: MstmemberComponent, canDeactivate: [BeforeunloadGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MstmemberRoutingModule { }
