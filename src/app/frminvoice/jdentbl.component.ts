import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
// import { Apollo } from 'apollo-angular';
// import gql from 'graphql-tag';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { JdnohelpComponent } from './../share/jdnohelp/jdnohelp.component';
// import { UserService } from './../services/user.service';
import { InvoiceService } from './invoice.service';

interface Jyuden {
  denno: number;
  zandaka: number;
  jtotal: number;
  htotal: number;
  ntotal: number;
  stotal: number;
  ttotal: number;
}

@Component({
  selector: 'app-jdentbl',
  templateUrl: './jdentbl.component.html',
  styleUrls: ['./jdentbl.component.scss']
})
export class JdentblComponent implements OnInit {
  // @Input() parentForm: FormGroup;
  jdno: number = 0;
  dataSource: MatTableDataSource<Jyuden>;
  displayedColumns = [
    'action',
    'denno',
    'zandaka',
    'jtotal',
    'htotal',
    'ntotal',
    'stotal',
    'ttotal'
  ]
  constructor(public invsrv: InvoiceService,
    // public usrsrv: UserService,
    private cdRef: ChangeDetectorRef,
    // private apollo: Apollo,
    private dialog: MatDialog) {
    this.dataSource = new MatTableDataSource<Jyuden>();
  }

  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.jdno = data.denno;
          this.cdRef.detectChanges();
          console.log(this.jdno);
          // this.get_hatden(this.denno);
        }
      }
    );
  }

  ngOnInit(): void {
    // this.add_rows(1);

  }

  refresh(): void {
    // this.dataSource.data = this.frmArr.controls;
  }
  add(): void {

  }
  delRow(i: number): void {

  }
}
