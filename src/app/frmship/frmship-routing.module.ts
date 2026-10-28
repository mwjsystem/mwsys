import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmshipComponent } from './frmship.component';
import { ShipprintComponent } from './shipprint.component';
import { PickComponent } from './pick.component';

const routes: Routes = [
  { path: '', component: FrmshipComponent },
  { path: 'print', component: ShipprintComponent },
  { path: 'pick', component: PickComponent },
  { path: 'pick/:denno', component: PickComponent },
  { path: 'keep', component: PickComponent, data: { kind: 'keep' } },
  { path: 'keep/:denno', component: PickComponent, data: { kind: 'keep' } },
  { path: ':mode/:denno', component: FrmshipComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmshipRoutingModule { }
