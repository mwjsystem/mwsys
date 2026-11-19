import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { CdkScrollable } from '@angular/cdk/scrolling';

@Component({
    selector: 'app-stcscds',
    templateUrl: './stcscds.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatButton, MatDialogTitle, CdkScrollable, MatDialogContent, MatDialogActions]
})
export class StcscdsComponent implements OnInit {
  private dialogRef = inject<MatDialogRef<StcscdsComponent>>(MatDialogRef);


  ngOnInit(): void {
  }



  close() {
    this.dialogRef.close();
  }
}
