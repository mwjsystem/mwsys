import { Routes } from '@angular/router';
import { FrmkakoComponent } from './frmkako.component';
import { KakolistComponent } from './kakolist.component';
import { KakocheckComponent } from './kakocheck.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

/**
 * 加工指示（/frmkako、/frmkako/{1:新規 2:変更 3:照会}/{加工指示番号}、/frmkako?jdenno= で受注伝票から新規、
 * /frmkako/list: 一覧、/frmkako/check/{加工指示番号}: 各拠点のスマホで状態を進める）
 */
export const FRMKAKO_ROUTES: Routes = [
  { path: '', component: FrmkakoComponent, canDeactivate: [BeforeunloadGuard] },
  { path: 'list', component: KakolistComponent },
  { path: 'check', component: KakocheckComponent },
  { path: 'check/:kno', component: KakocheckComponent },
  { path: ':mode/:kno', component: FrmkakoComponent, canDeactivate: [BeforeunloadGuard] },
];
