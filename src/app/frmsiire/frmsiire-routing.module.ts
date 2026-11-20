import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FrmsiireComponent } from './frmsiire.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { SiibulkComponent } from './siibulk.component';
import { SiicheckComponent } from './siicheck.component';

const routes: Routes = [
  { path: '', component: FrmsiireComponent, canDeactivate: [BeforeunloadGuard] },
  // 発注番号を指定して、仕入伝票を一括で作る
  { path: 'bulk', component: SiibulkComponent },
  // 海外入荷チェック（倉庫のスマホ。仕入伝票番号はカンマで複数）
  { path: 'check', component: SiicheckComponent },
  { path: 'check/:dennos', component: SiicheckComponent },
  { path: ':mode/:denno', component: FrmsiireComponent, canDeactivate: [BeforeunloadGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrmsiireRoutingModule { }
