import { Routes } from '@angular/router';
import { FrmtanaComponent } from './frmtana.component';
import { TanascanComponent } from './tanascan.component';
import { TanasumComponent } from './tanasum.component';

/** 棚卸（/frmtana: 単票、/frmtana/scan: スマホ、/frmtana/sum: 棚卸集計・一括確定） */
export const FRMTANA_ROUTES: Routes = [
  { path: '', component: FrmtanaComponent },
  { path: 'scan', component: TanascanComponent },
  { path: 'sum', component: TanasumComponent },
];
