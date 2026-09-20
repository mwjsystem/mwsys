import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef } from "@angular/material/dialog";

@Component({
    selector: 'app-stcscds',
    templateUrl: './stcscds.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class StcscdsComponent implements OnInit {

  constructor(
    private dialogRef: MatDialogRef<StcscdsComponent>) { }

  ngOnInit(): void {
  }



  close() {
    this.dialogRef.close();
  }
}
