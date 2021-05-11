import { Component, OnInit, ViewChild } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { GoodsService } from './../services/goods.service';

@Component({
  selector: 'app-gtnktbl',
  templateUrl: './gtnktbl.component.html',
  styleUrls: ['./gtnktbl.component.scss']
})
export class GtnktblComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<mwI.Gtanka>;
  displayedColumns =['gcode','day','tanka1','tanka2','tanka3','tanka4','tanka5','tanka6','tanka7','tanka8','tanka9','cost','genka','taxrate','currency'];


  constructor(public gdssrv:GoodsService
    ) {
      this.dataSource= new MatTableDataSource<mwI.Gtanka>(this.gdssrv.gtnks);
     }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;    
    this.gdssrv.obserGds.subscribe(() => this.refresh());
  }
  refresh(): void {
    //tableのデータソース更新
    this.dataSource= new MatTableDataSource<mwI.Gtanka>(this.gdssrv.gtnks);
    this.dataSource.paginator = this.paginator;
  }
}
