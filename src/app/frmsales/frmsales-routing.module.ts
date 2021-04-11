import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmsalesComponent } from './frmsales.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrmsalesComponent },
  { path: ':mode/:denno', component: FrmsalesComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmsalesRoutingModule { }
