import { NgModule, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CoreModule } from './../core/core.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import localeJa from '@angular/common/locales/ja';

import { FrmsiireRoutingModule } from './frmsiire-routing.module';
import { FrmsiireComponent } from './frmsiire.component';
import { SimeitblComponent } from './simeitbl.component';
import { SdnohelpComponent } from '../share/sdnohelp/sdnohelp.component';
import { HmeihelpComponent } from '../share/hmeihelp/hmeihelp.component';
// import { BeforeunloadGuard } from './../beforeunload.guard';

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

registerLocaleData(localeJa);

@NgModule({
  declarations: [
    FrmsiireComponent,
    SimeitblComponent,
    SdnohelpComponent,
    HmeihelpComponent
  ],
  imports: [
    CommonModule,
    CoreModule,
    FrmsiireRoutingModule,
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
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ja-JP' }
  ]
})
export class FrmsiireModule { }
