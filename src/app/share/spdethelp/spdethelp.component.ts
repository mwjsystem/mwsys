import { Component, OnInit, Inject } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
// import { Apollo } from 'apollo-angular';
// import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
// import { ToastrService } from 'ngx-toastr';


interface Nymat {
  denno: number;
  line: number;
  yday: string;
  ydaykbn: string;
  suu: number;
  hatzn: number;
  nymat: number;
  matzn: number;
  mbiko: string;
}

@Component({
  selector: 'app-spdethelp',
  templateUrl: './spdethelp.component.html',
  styleUrls: ['./spdethelp.component.scss']
})
export class SpdethelpComponent implements OnInit {
  dataSource: MatTableDataSource<Nymat>;
  jyusuu: number;
  public displayedColumns = ['denno', 'line', 'yday', 'ydaykbn', 'suu', 'hatzn', 'nymat', 'matzn', 'mbiko'];
  constructor(
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    // private toastr: ToastrService,
    // private apollo: Apollo,
    private dialogRef: MatDialogRef<SpdethelpComponent>,
    @Inject(MAT_DIALOG_DATA) data) {
    let lcTbl: Nymat[] = [];
    // console.log(data);
    this.jyusuu = data.suu;
    data.nymat.forEach(e => {
      lcTbl.push({
        denno: e.denno,
        line: e.line,
        yday: e.yday,
        ydaykbn: e.ydaykbn,
        suu: e.suu,
        hatzn: e.hatzn,
        nymat: e.nymat,
        matzn: e.matzn,
        mbiko: e.mbiko,
      });
    });
    this.dataSource = new MatTableDataSource<Nymat>(lcTbl);
  }

  ngOnInit(): void {
  }

  sel_vcd(selected) {
    // console.log(this.jyusuu<selected.matzn);
    if (this.jyusuu > selected.matzn) {
      this.usrsrv.toastWar("受注数量" + this.jyusuu + "に足りません。一旦、閉じて受注明細を分割してください。");
    } else {
      this.dialogRef.close(selected);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
