import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmshipComponent } from './frmship.component';
import { ShipprintComponent } from './shipprint.component';

const routes: Routes = [
  { path: '', component: FrmshipComponent },
  { path: 'print', component: ShipprintComponent },
  { path: ':mode/:denno', component: FrmshipComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmshipRoutingModule { }
