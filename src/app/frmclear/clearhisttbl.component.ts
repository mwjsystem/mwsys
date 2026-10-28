import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { UserService } from './../services/user.service';
import { Seihis, ClearService } from './clear.service';

@Component({
    selector: 'app-clearhisttbl',
    templateUrl: './clearhisttbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow]
})
export class ClearhisttblComponent implements OnInit {
  private cdRef = inject(ChangeDetectorRef);
  clrsrv = inject(ClearService);
  usrsrv = inject(UserService);

  dataSource = new MatTableDataSource<Seihis>();
  displayedColumns: string[] = [
    'denno',
    'nmoney',
    'smoney',
    'tmoney',
    'total',
    'memo'];

  ngOnInit(): void {
    this.clrsrv.observeH.subscribe((seihis) => {
      this.dataSource = new MatTableDataSource<Seihis>(seihis);
      this.cdRef.detectChanges();
    });
  }


}
