import { Routes } from '@angular/router';
import { PriceimpComponent } from './priceimp.component';
import { KakehyoComponent } from './kakehyo.component';

/** 商品の価格（/mstprice: 価格改定取込、/mstprice/kake: 掛率表） */
export const MSTPRICE_ROUTES: Routes = [
  { path: '', component: PriceimpComponent },
  { path: 'kake', component: KakehyoComponent },
];
