import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FlexLayoutModule } from '@angular/flex-layout';
import { NavbarComponent } from './navbar/navbar.component';
import { TmstmpComponent } from './tmstmp/tmstmp.component';
import { MaterialModule } from '../material.module';
import { RouterModule } from '@angular/router';
import { TabDirective } from './../share/tabidx/tab.directive';
import { NuminputDirective } from './directives/numinput.directive'; 
import { NgxYubinBangoModule } from 'ngx-yubinbango';
import { QRCodeModule } from 'angular2-qrcode';
import { OverlayModule } from '@angular/cdk/overlay';
import { PortalModule } from '@angular/cdk/portal';
import { StaffPipe } from './pipes/staff.pipe';
import { JdatePipe } from './pipes/jdate.pipe';
import localeJa from '@angular/common/locales/ja';
import { McdtxtPipe } from './pipes/mcdtxt.pipe';
import { BunruiPipe } from './pipes/bunrui.pipe';
import { VcdtxtPipe } from './pipes/vcdtxt.pipe';
import { ModetxtPipe } from './pipes/modetxt.pipe';

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    NavbarComponent,
    TmstmpComponent,
    NuminputDirective,
    TabDirective,
    StaffPipe,
    JdatePipe,
    McdtxtPipe,
    BunruiPipe,
    VcdtxtPipe,
    ModetxtPipe
  ],
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    FlexLayoutModule,
    NgxYubinBangoModule,
    ReactiveFormsModule,
    RouterModule
  ],
  exports: [
    NavbarComponent,
    NuminputDirective,
    TabDirective,
    NgxYubinBangoModule,
    StaffPipe,
    JdatePipe,
    McdtxtPipe,
    BunruiPipe,
    VcdtxtPipe,
    ModetxtPipe,
    TmstmpComponent,
    MaterialModule, 
    FormsModule,
    FlexLayoutModule,
    ReactiveFormsModule,
    QRCodeModule,
    OverlayModule,
    PortalModule 
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'ja-JP' }]
})
export class CoreModule { }
