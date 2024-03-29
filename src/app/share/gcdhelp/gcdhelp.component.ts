import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, Inject } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { GrpcdhelpComponent } from './../grpcdhelp/grpcdhelp.component';
import { Subject } from 'rxjs';

export interface Gcd {
  code: string;
  gcode: string;
  gtext: string;
  size: string;
  color: string;
  jan: string;
  unit: string;
  gskbn: number;
  tkbn: number;
  zkbn: number;
}

@Component({
  selector: 'app-gcdhelp',
  templateUrl: './gcdhelp.component.html',
  styleUrls: ['./../../help.component.scss']
})
export class GcdhelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  dataSource: MatTableDataSource<Gcd>;
  displayedColumns = ['code', 'gcode', 'gtext', 'size', 'color', 'jan', 'unit', 'gskbn', 'tkbn'];
  public gcds: Gcd[];
  public code: string = "";
  public jan: string = "";
  public gcode: string = "";
  public gtext: string = "";
  public tkbn: string[] = [];
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  constructor(private dialogRef: MatDialogRef<GcdhelpComponent>,
    private dialog: MatDialog,
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    public cdRef: ChangeDetectorRef,
    private apollo: Apollo,
    @Inject(MAT_DIALOG_DATA) data) {
    this.dataSource = new MatTableDataSource<Gcd>(this.gcds);
    if (typeof data != 'undefined') {
      this.gcode = (data?.gcode ?? '');
      this.tkbn = (data?.tkbn ?? '');
      if (this.gcode) { this.filterGcd(); }
    }
  }

  ngOnInit(): void {
    // this.dataSource.paginator = this.paginator;
    // this.dataSource= new MatTableDataSource<Gcd>(this.gcds);
    this.observe.subscribe(() => this.refresh());
  }

  filterGcd() {
    // console.log(this.tkbn);
    let varWh: { [k: string]: any } = {
      "where": {
        "_and": [
          { "id": { "_eq": this.usrsrv.compid } }
        ]
      }
    };
    if (this.code !== "") {
      varWh['where']._and.push({ "code": { "_like": "%" + this.code + "%" } });
    }
    if (this.jan !== "") {
      varWh['where']._and.push({ "jan": { "_like": "%" + this.jan + "%" } });
    }
    if (this.gcode !== "") {
      varWh['where']._and.push({ "gcode": { "_like": "%" + this.gcode + "%" } });
    }
    if (this.gtext !== "") {
      varWh['where']._and.push({ "gtext": { "_like": "%" + this.gtext + "%" } });
    }
    if (this.tkbn.length > 0) {
      varWh['where']._and.push({ "tkbn": { "_in": this.tkbn } });
    }
    const GetMast = gql`
    query get_goods($where:msgoods_bool_exp!) {
    msgoods(where:$where) {
      code
      gcode
      gtext
      size
      color
      jan
      unit
      gskbn
      tkbn
      }
    }`;
    // console.log(varWh);
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: varWh
    })
      .valueChanges
      .subscribe(({ data }) => {
        // console.log(data);
        if (data.msgoods.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          this.gcds = data.msgoods;
          this.subject.next(true);
        }
        // this.subject.complete();
      }, (error) => {
        console.log('error query get_goods', error);
      });
  }

  grpcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GrpcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.code = data.code;
          this.cdRef.detectChanges();
          console.log(this.code, data.code);
        }
        this.refresh();
      }
    );
  }

  convUpper(event: KeyboardEvent): string {
    return this.usrsrv.convUpper((event.target as HTMLInputElement)?.value);

  }

  setGcd(selected) {
    this.dialogRef.close(selected);
  }

  close() {
    // this.mcdsrv.mcds=[];
    this.dialogRef.close();
  }

  refresh(): void {
    //tableのデータソース更新
    this.dataSource = new MatTableDataSource<Gcd>(this.gcds);
    this.dataSource.paginator = this.paginator;
  }

}