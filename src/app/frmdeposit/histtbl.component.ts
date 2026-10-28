import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { UserService } from './../services/user.service';
import { Nyuhis, DepositService } from './deposit.service';

@Component({
    selector: 'app-histtbl',
    templateUrl: './histtbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow]
})
export class HisttblComponent implements OnInit {
  private cdRef = inject(ChangeDetectorRef);
  depsrv = inject(DepositService);
  usrsrv = inject(UserService);

  // @Input() parentForm: FormGroup;
  dataSource = new MatTableDataSource<Nyuhis>();
  displayedColumns: string[] = [
    'denno',
    'nmoney',
    'smoney',
    'tmoney',
    'total',
    'memo'];

  ngOnInit(): void {
    this.depsrv.observeH.subscribe((nyuhis) => {
      this.dataSource = new MatTableDataSource<Nyuhis>(nyuhis);
      this.cdRef.detectChanges();
    });
  }


}
