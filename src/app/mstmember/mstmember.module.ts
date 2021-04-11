import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';

import { MstmemberRoutingModule } from './mstmember-routing.module';
import { MstmemberComponent } from './mstmember.component';
import { AddressComponent } from './../share/address/address.component';
import { AdredaComponent } from './../share/adreda/adreda.component';
import { EdahelpComponent } from './../share/adreda/edahelp.component';
import { EdatblComponent } from './../share/adreda/edatbl.component';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { McdtblComponent } from './../share/mcdhelp/mcdtbl.component';


@NgModule({
  declarations: [
    MstmemberComponent,
    AddressComponent,
    AdredaComponent,
    McdhelpComponent,
    McdtblComponent,
    EdahelpComponent,
    EdatblComponent,
  ],
  imports: [
    CommonModule,
    CoreModule,
    MstmemberRoutingModule
  ]
})
export class MstmemberModule { }
