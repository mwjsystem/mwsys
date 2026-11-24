import { Routes } from '@angular/router';
import { MstetcComponent } from './mstetc.component';
import { STAFF_DEF, STORE_DEF } from './mstetc-defs';

/** 小さなマスタのメンテナンス（/mstetc/staff: 担当者マスタ、/mstetc/store: 倉庫マスタ） */
export const MSTETC_ROUTES: Routes = [
  { path: 'staff', component: MstetcComponent, data: { def: STAFF_DEF } },
  { path: 'store', component: MstetcComponent, data: { def: STORE_DEF } },
  { path: '', redirectTo: 'staff', pathMatch: 'full' },
];
