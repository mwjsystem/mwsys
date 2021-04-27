import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmkeepComponent } from './frmkeep.component';

const routes: Routes = [
  { path: '', component: FrmkeepComponent },
  { path: ':denno', component: FrmkeepComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmkeepRoutingModule { }
