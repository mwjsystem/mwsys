import { Routes } from '@angular/router';
import { FrmtenkaiComponent } from './frmtenkai.component';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { TencheckComponent } from './tencheck.component';

/** 展開伝票（/frmtenkai、/frmtenkai/{1:新規 2:変更 3:照会}/{伝票番号}） */
export const FRMTENKAI_ROUTES: Routes = [
  { path: '', component: FrmtenkaiComponent, canDeactivate: [BeforeunloadGuard] },
  // 倉庫のスマホで展開指示書の QR を読んで、展開完了にする
  { path: 'check', component: TencheckComponent },
  { path: 'check/:denno', component: TencheckComponent },
  { path: ':mode/:denno', component: FrmtenkaiComponent, canDeactivate: [BeforeunloadGuard] },
];
