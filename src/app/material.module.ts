import { NgModule } from '@angular/core';
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
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';;
import { DragDropModule } from '@angular/cdk/drag-drop';

@NgModule({
  imports: [
      MatButtonModule
     ,MatCardModule
     ,MatCheckboxModule
     ,MatDatepickerModule
     ,MatDialogModule
     ,MatExpansionModule
     ,MatFormFieldModule
     ,MatIconModule
     ,MatInputModule
     ,MatMenuModule
     ,MatPaginatorModule
     ,MatProgressSpinnerModule
     ,MatSelectModule
     ,MatStepperModule
     ,MatTableModule
     ,MatTabsModule
     ,MatToolbarModule
     ,MatTooltipModule
     ,MatNativeDateModule
     ,DragDropModule
  ],
  providers: [
    {provide: MAT_DATE_LOCALE, useValue: 'ja-JP'}
  ],
  exports: [
      MatButtonModule
     ,MatCardModule
     ,MatCheckboxModule
     ,MatDatepickerModule
     ,MatDialogModule
     ,MatExpansionModule
     ,MatFormFieldModule
     ,MatIconModule
     ,MatInputModule
     ,MatMenuModule
     ,MatPaginatorModule
     ,MatProgressSpinnerModule
     ,MatSelectModule
     ,MatStepperModule
     ,MatTableModule
     ,MatTabsModule
     ,MatToolbarModule
     ,MatTooltipModule
     ,MatNativeDateModule
     ,DragDropModule
  ]
})
export class MaterialModule { }
