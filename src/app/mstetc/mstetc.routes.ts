import { Routes } from '@angular/router';
import { MstetcComponent } from './mstetc.component';
import { STAFF_DEF, STORE_DEF, HOKURI_DEF, BUNTYPE_DEF, BUNSHO_DEF, HKTIME_DEF, RATE_DEF } from './mstetc-defs';

/**
 * 小さなマスタのメンテナンス
 * （/mstetc/staff: 担当者、/mstetc/store: 倉庫、/mstetc/hokuri: 配送方法、/mstetc/buntype: 帳票タイプ、/mstetc/bunsho: 文書、
 *   /mstetc/hktime: 配達時間、/mstetc/rate: 為替レート）
 */
export const MSTETC_ROUTES: Routes = [
  { path: 'staff', component: MstetcComponent, data: { def: STAFF_DEF } },
  { path: 'store', component: MstetcComponent, data: { def: STORE_DEF } },
  { path: 'hokuri', component: MstetcComponent, data: { def: HOKURI_DEF } },
  { path: 'buntype', component: MstetcComponent, data: { def: BUNTYPE_DEF } },
  { path: 'bunsho', component: MstetcComponent, data: { def: BUNSHO_DEF } },
  { path: 'hktime', component: MstetcComponent, data: { def: HKTIME_DEF } },
  { path: 'rate', component: MstetcComponent, data: { def: RATE_DEF } },
  { path: '', redirectTo: 'staff', pathMatch: 'full' },
];
