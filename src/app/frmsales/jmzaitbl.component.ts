import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { SpdethelpComponent } from './../share/spdethelp/spdethelp.component';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
// import { StockService } from './../services/stock.service';
// import { ToastrService } from 'ngx-toastr';
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';

export class Jmzai {
  eda!: number;
  gcode!: string;
  suu!: number;
  genka!: number;
  spec!: string;
  spdet!: string;
}

@Component({
    selector: 'app-jmzaitbl',
    templateUrl: './jmzaitbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class JmzaitblComponent implements OnInit {
  private dialogRef = inject<MatDialogRef<JmzaitblComponent>>(MatDialogRef);
  private dialog = inject(MatDialog);
  private apollo = inject(Apollo);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);

  dataSource: MatTableDataSource<Jmzai> = new MatTableDataSource();
  scode: string;
  displayedColumns = ['eda', 'gcode', 'suu', 'genka', 'pable', 'spec', 'spdet'];
  constructor() {
    const data = inject(MAT_DIALOG_DATA);

    this.dataSource.data = data.tbldata;
    this.scode = data.scode;
  }

  ngOnInit(): void {


  }
  spdetHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    this.apollo.watchQuery<any>({
      query: Query.GetTran,
      variables: {
        id: this.usrsrv.compid,
        gcd: this.dataSource.data[i].gcode
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        if (data.vnymat.length == 0) {
          this.usrsrv.toastWar("入荷予定が見つかりません");
        } else {
          dialogConfig.data = {
            nymat: data.vnymat,
            suu: this.dataSource.data[i].suu
          };
          let dialogRef = this.dialog.open(SpdethelpComponent, dialogConfig);

          dialogRef.afterClosed().subscribe(
            data => {
              if (typeof data != 'undefined') {
                // console.log(data,data.denno || '_' || data.line);
                this.dataSource.data[i].spec = '8';
                this.dataSource.data[i].spdet = data.denno + '_' + data.line;
              }
            }
          );
        }

      });

  }

  edited(selected: any) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
