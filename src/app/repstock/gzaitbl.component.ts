import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';;
import { Stcbs, StockService } from './../services/stock.service';

@Component({
  selector: 'app-gzaitbl',
  templateUrl: './gzaitbl.component.html',
  styleUrls: ['./gzaitbl.component.scss']
})
export class GzaitblComponent implements OnInit {
  dataSource:MatTableDataSource<Stcbs>;
  displayedColumns = ['gcode','irisu','pable','stock','hikat','yday','suu','htzan']; 
 

  constructor(public stcsrv: StockService,
              public cdRef: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.stcsrv.observe.subscribe(() => this.refresh());
  }

  refresh(): void {
    //tableのデータソース更新
    this.dataSource= new MatTableDataSource<Stcbs>(this.stcsrv.stcbs);
    this.cdRef.detectChanges();
  }

}
