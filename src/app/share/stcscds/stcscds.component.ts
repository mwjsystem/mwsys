import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from "@angular/material/dialog";

@Component({
  selector: 'app-stcscds',
  templateUrl: './stcscds.component.html',
  styleUrls: ['./stcscds.component.scss']
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
