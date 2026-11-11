import { Routes } from '@angular/router';
import { BeforeunloadGuard } from './../beforeunload.guard';
import { FrmnyukinComponent } from './frmnyukin.component';
import { NyubulkComponent } from './nyubulk.component';
import { NyubankComponent } from './nyubank.component';
import { NyudaibikiComponent } from './nyudaibiki.component';

/**
 * 入金（/frmnyukin: 入金伝票、/frmnyukin/{1:新規 2:変更 3:照会}/{伝票番号}、/frmnyukin/bulk: 一括入金、
 * /frmnyukin/bank: 入金テキスト読込、/frmnyukin/daibiki: 佐川代引消込）
 */
export const FRMNYUKIN_ROUTES: Routes = [
  { path: '', component: FrmnyukinComponent, canDeactivate: [BeforeunloadGuard] },
  { path: 'bulk', component: NyubulkComponent },
  { path: 'bank', component: NyubankComponent },
  { path: 'daibiki', component: NyudaibikiComponent },
  { path: ':mode/:denno', component: FrmnyukinComponent, canDeactivate: [BeforeunloadGuard] },
];
