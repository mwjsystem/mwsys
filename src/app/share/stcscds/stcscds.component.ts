import { Component, OnInit } from '@angular/core';
import { MatLegacyDialogRef as MatDialogRef } from "@angular/material/legacy-dialog";

@Component({
  selector: 'app-stcscds',
  templateUrl: './stcscds.component.html',
  styleUrls: ['./../../help.component.scss']
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
