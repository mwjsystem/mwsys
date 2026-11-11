import { Routes } from '@angular/router';
import { FrmhgndenComponent } from './frmhgnden.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

/** 発注外入荷伝票（/frmhgnden、/frmhgnden/{1:新規 2:変更 3:照会}/{伝票番号}） */
export const FRMHGNDEN_ROUTES: Routes = [
  { path: '', component: FrmhgndenComponent, canDeactivate: [BeforeunloadGuard] },
  { path: ':mode/:denno', component: FrmhgndenComponent, canDeactivate: [BeforeunloadGuard] },
];
