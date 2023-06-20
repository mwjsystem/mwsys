import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { Trans, TransService } from './../services/trans.service';
import { UserService } from './../services/user.service';


@Component({
  selector: 'app-trantbl',
  templateUrl: './trantbl.component.html',
  styleUrls: ['./../tbl.component.scss']
})
export class TrantblComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  public dataSource: MatTableDataSource<Trans>;
  public displayedColumns = ['ttype', 'sday', 'yday', 'aitec', 'aiten', 'denno', 'mline', 'tcode', 'biko', 'insuu',
    'ousuu', 'zaisu', 'yotei', 'wait'];

  constructor(public trnsrv: TransService,
    public usrsrv: UserService,
    public cdRef: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.trnsrv.observe.subscribe(() => {
      // console.log('ngoninit');
      this.refresh();
    });
  }

  setColor(ttype: string): string {
    let color: string;
    switch (ttype) {
      case "発注":
        color = 'aqua';
        break;
      case "受注返品":
        color = 'slategray';
        break;
      case "仕入":
        color = 'mediumblue';
        break;
      case "仕入返品":
        color = 'navy';
        break;
      case "展開先":
        color = 'darkorange';
        break;
      case "展開元":
        color = 'orange';
        break;
      case "移動入庫":
        color = 'blue';
        break;
      case "移動出庫":
        color = 'royalblue';
        break;
      case "破棄":
        color = 'red';
        break;
      case "発注外入荷":
        color = 'green';
        break;
      case "棚卸":
        color = 'magenta';
        break;
      default:
        color = 'black';
    }
    return color;
  }
  refresh(): void {
    // console.log(this.trnsrv.tbldata);
    this.dataSource = new MatTableDataSource<Trans>(this.trnsrv.sortTblData(this.trnsrv.tbldata));
    this.dataSource.paginator = this.paginator;
    this.cdRef.detectChanges();
  }

  chFlg(): void {
    this.trnsrv.flg *= -1;
    this.refresh();
  }

}
