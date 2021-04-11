import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from "@angular/material/dialog";

@Component({
  selector: 'app-edahelp',
  templateUrl: './edahelp.component.html',
  styleUrls: ['./edahelp.component.scss']
})
export class EdahelpComponent implements OnInit {
  constructor(private dialogRef: MatDialogRef<EdahelpComponent>) {}

  ngOnInit(): void {
  }

  sel_eda(selected) {
    // console.log("select",selected);
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }

}
