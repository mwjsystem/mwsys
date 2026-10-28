import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { Stcbs, StockService } from './../services/stock.service';

@Component({
    selector: 'app-gzaitbl',
    templateUrl: './gzaitbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow]
})
export class GzaitblComponent implements OnInit {
  stcsrv = inject(StockService);
  cdRef = inject(ChangeDetectorRef);

  public dataSource!: MatTableDataSource<Stcbs>;
  public displayedColumns = ['gcode', 'irisu', 'pable', 'stock', 'hikat', 'yday', 'suu', 'htzan'];

  ngOnInit(): void {
    this.stcsrv.observe.subscribe(() => this.refresh());
  }

  refresh(): void {
    //tableのデータソース更新
    this.dataSource = new MatTableDataSource<Stcbs>(this.stcsrv.stcbs);
    this.cdRef.detectChanges();
  }

}
