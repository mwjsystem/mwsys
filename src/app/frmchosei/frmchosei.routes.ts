import { Routes } from '@angular/router';
import { FrmchoseiComponent } from './frmchosei.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

/** 在庫調整伝票（/frmchosei、/frmchosei/{1:新規 2:変更 3:照会}/{伝票番号}） */
export const FRMCHOSEI_ROUTES: Routes = [
  { path: '', component: FrmchoseiComponent, canDeactivate: [BeforeunloadGuard] },
  { path: ':mode/:denno', component: FrmchoseiComponent, canDeactivate: [BeforeunloadGuard] },
];
