import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrminvoiceComponent } from './frminvoice.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

const routes: Routes = [
  { path: '', component: FrminvoiceComponent },
  { path: ':mode/:denno', component: FrminvoiceComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrminvoiceRoutingModule { }
