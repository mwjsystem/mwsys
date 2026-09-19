import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmmoveComponent } from './frmmove.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrmmoveComponent },
  { path: ':mode/:denno', component: FrmmoveComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmmoveRoutingModule { }
