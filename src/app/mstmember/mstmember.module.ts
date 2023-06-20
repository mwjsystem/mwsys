import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from './../core/core.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { MstmemberRoutingModule } from './mstmember-routing.module';
import { MstmemberComponent } from './mstmember.component';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { AddressComponent } from './../share/address/address.component';
import { AdredaComponent } from './../share/adreda/adreda.component';
import { EdahelpComponent } from './../share/adreda/edahelp.component';
import { MsprcprtComponent } from '../share/msprcprt/msprcprt.component';
import { MsprocComponent } from '../share/msproc/msproc.component';
import { PartshelpComponent } from '../share/partshelp/partshelp.component';
import { BeforeunloadGuard } from './../beforeunload.guard';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';

@NgModule({
  declarations: [
    MstmemberComponent,
    AddressComponent,
    AdredaComponent,
    McdhelpComponent,
    EdahelpComponent,
    MsprcprtComponent,
    MsprocComponent,
    PartshelpComponent,
  ],
  imports: [
    CommonModule,
    CoreModule,
    MstmemberRoutingModule,
    FormsModule,
    ReactiveFormsModule,

    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    MatToolbarModule
  ]
})
export class MstmemberModule { }
