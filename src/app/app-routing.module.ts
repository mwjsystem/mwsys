import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthGuard } from '@auth0/auth0-angular';
import { LoginComponent } from './login/login.component';


const routes: Routes = [
  { path: '', loadChildren: () => import('./home/home.module').then(m => m.HomeModule),  canActivate: [AuthGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'mstmember', loadChildren: () => import('./mstmember/mstmember.module').then(m => m.MstmemberModule),  canActivate: [AuthGuard] },
  { path: 'frmsales', loadChildren: () => import('./frmsales/frmsales.module').then(m => m.FrmsalesModule),  canActivate: [AuthGuard] },
  { path: 'mstgoods', loadChildren: () => import('./mstgoods/mstgoods.module').then(m => m.MstgoodsModule),  canActivate: [AuthGuard] },
  { path: 'frmkeep', loadChildren: () => import('./frmkeep/frmkeep.module').then(m => m.FrmkeepModule),  canActivate: [AuthGuard] },
  { path: 'frmtreat', loadChildren: () => import('./frmtreat/frmtreat.module').then(m => m.FrmtreatModule),  canActivate: [AuthGuard] },
  { path: 'repstock', loadChildren: () => import('./repstock/repstock.module').then(m => m.RepstockModule),  canActivate: [AuthGuard] }
];

@NgModule({
  imports: [CommonModule, RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
