import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmdepositComponent } from './frmdeposit.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrmdepositComponent },
  { path: ':mode/:denno', component: FrmdepositComponent, canDeactivate: [BeforeunloadGuard] },
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmdepositRoutingModule { }
