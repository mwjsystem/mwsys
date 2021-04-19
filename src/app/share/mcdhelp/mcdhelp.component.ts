import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef } from "@angular/material/dialog";
import { Mcd,McdService } from './mcd.service';

@Component({
  selector: 'app-mcdhelp',
  templateUrl: './mcdhelp.component.html',
  styleUrls: ['./mcdhelp.component.scss'],
  changeDetection:ChangeDetectionStrategy.OnPush
})
export class McdhelpComponent implements OnInit {

  constructor(public mcdsrv:McdService,
              private dialogRef: MatDialogRef<McdhelpComponent>) {
  }

  ngOnInit(): void {
  }

  sel_mcd(selected:Mcd ) {
    // console.log("select",selected);
    this.mcdsrv.mcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    this.mcdsrv.mcds=[];
    this.dialogRef.close();
  }



}
