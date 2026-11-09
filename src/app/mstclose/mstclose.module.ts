import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { CoreModule } from './../core/core.module';
import { MstcloseComponent } from './mstclose.component';

const routes: Routes = [
  { path: '', component: MstcloseComponent }
];

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule.forChild(routes),
    MstcloseComponent
  ]
})
export class MstcloseModule { }
