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
import { MsstitComponent } from '../share/msstit/msstit.component';
// import { UserService } from './../services/user.service';


@NgModule({
  declarations: [
    MstmemberComponent,
    AddressComponent,
    AdredaComponent,
    McdhelpComponent,
    McdtblComponent,
    EdahelpComponent,
    EdatblComponent,
    MsstitComponent,
  ],
  imports: [
    CommonModule,
    CoreModule,
    MstmemberRoutingModule
  ],
  //  providers: [UserService]
})
export class MstmemberModule { }
