import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogRef } from "@angular/material/dialog";

@Component({
    selector: 'app-stcscds',
    templateUrl: './stcscds.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class StcscdsComponent implements OnInit {
  private dialogRef = inject<MatDialogRef<StcscdsComponent>>(MatDialogRef);


  ngOnInit(): void {
  }



  close() {
    this.dialogRef.close();
  }
}
