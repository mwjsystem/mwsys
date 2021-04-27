import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FlexLayoutModule } from '@angular/flex-layout';
import { NavbarComponent } from './navbar/navbar.component';
import { TmstmpComponent } from './tmstmp/tmstmp.component';
import { MaterialModule } from '../material.module';
import { RouterModule } from '@angular/router';
import { TabDirective } from './../share/tabidx/tab.directive';
import { NuminputDirective } from './directives/numinput.directive';
import { QRCodeModule } from 'angular2-qrcode';

@NgModule({
  declarations: [
    NavbarComponent,
    TmstmpComponent,
    NuminputDirective,
    TabDirective
  ],
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    FlexLayoutModule,
    ReactiveFormsModule,
    RouterModule 
  ],
  exports: [
    NavbarComponent,
    NuminputDirective,
    TabDirective,
    TmstmpComponent,
    MaterialModule, 
    FormsModule,
    FlexLayoutModule,
    ReactiveFormsModule,
    QRCodeModule 
  ]
})
export class CoreModule { }
