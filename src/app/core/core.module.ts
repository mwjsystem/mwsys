import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TmstmpComponent } from './tmstmp/tmstmp.component';
import { TabDirective } from './directives/tabidx/tab.directive';
import { NuminputDirective } from './directives/numinput.directive';
import { StaffPipe } from './pipes/staff.pipe';
import { JdatePipe } from './pipes/jdate.pipe';
import { McdtxtPipe } from './pipes/mcdtxt.pipe';
import { VcdtxtPipe } from './pipes/vcdtxt.pipe';
import { ModetxtPipe } from './pipes/modetxt.pipe';
import { BlankPipe } from './pipes/blank.pipe';

@NgModule({
  declarations: [
    TmstmpComponent,
    NuminputDirective,
    TabDirective,
    StaffPipe,
    JdatePipe,
    McdtxtPipe,
    VcdtxtPipe,
    ModetxtPipe,
    BlankPipe
  ],
  imports: [
    CommonModule
  ],
  exports: [
    NuminputDirective,
    TabDirective,
    StaffPipe,
    JdatePipe,
    McdtxtPipe,
    VcdtxtPipe,
    ModetxtPipe,
    BlankPipe,
    TmstmpComponent
  ]
})
export class CoreModule { }
