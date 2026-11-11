import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmsiireComponent } from './frmsiire.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { SiibulkComponent } from './siibulk.component';

const routes: Routes = [
  { path: '', component: FrmsiireComponent },
  // 発注番号を指定して、仕入伝票を一括で作る
  { path: 'bulk', component: SiibulkComponent },
  { path: ':mode/:denno', component: FrmsiireComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmsiireRoutingModule { }
