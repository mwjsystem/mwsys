import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmsiireComponent } from './frmsiire.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrmsiireComponent },
  { path: ':mode/:denno', component: FrmsiireComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmsiireRoutingModule { }
