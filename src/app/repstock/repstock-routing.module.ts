import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RepstockComponent } from './repstock.component';
import { StockscanComponent } from './stockscan.component';

const routes: Routes = [
  { path: '', component: RepstockComponent },
  { path: 'scan', component: StockscanComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RepstockRoutingModule { }
