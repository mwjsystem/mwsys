import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmclearComponent } from './frmclear.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrmclearComponent },
  { path: ':mode/:denno', component: FrmclearComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmclearRoutingModule { }
