import { Component, OnInit, Input, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MembsService } from './../../mstmember/membs.service';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatToolbar } from '@angular/material/toolbar';
import { MatFormField, MatLabel, MatInput } from '@angular/material/input';

@Component({
    selector: 'app-edahelp',
    templateUrl: './edahelp.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, CdkScrollable, MatDialogContent, MatToolbar, MatFormField, MatLabel, MatInput, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatDialogActions]
})
export class EdahelpComponent implements OnInit {
  memsrv = inject(MembsService);
  private dialogRef = inject<MatDialogRef<EdahelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  public filters: { id: string; value: string }[] = [{ id: 'adrname', value: '' },
  { id: 'region', value: '' },
  { id: 'local', value: '' },
  { id: 'tel', value: '' },
  ];
  dataSource: MatTableDataSource<mwI.Edahlp>;
  displayedColumns = ['eda', 'adrname', 'zip', 'region', 'local', 'street', 'extend', 'extend2', 'tel'];

  constructor() {
    this.dataSource = new MatTableDataSource<mwI.Edahlp>(this.memsrv.edas);
  }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator() ?? null;
    // this.edasrv.observe.subscribe();
    this.dataSource.filterPredicate = (data: mwI.Edahlp, filtersJson: string) => {
      const matchFilter: boolean[] = [];
      const record = data as unknown as Record<string, string | null>;
      const filters = JSON.parse(filtersJson);
      filters.forEach((filter: { id: string | number; value: string; }) => {
        const raw = record[filter.id];
        const val = (raw === null ? '' : raw) as string;
        matchFilter.push(val.toLowerCase().includes(filter.value.toLowerCase()));
      });
      return matchFilter.every(Boolean);
    };
  }
  applyFilter(): void {
    this.dataSource.filter = JSON.stringify(this.filters);
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }
  updateFilter(fldid: string, event: KeyboardEvent): void {
    let i: number = this.filters.findIndex((obj: { id: string; }) => obj.id == fldid);
    if (i > -1) {
      this.filters[i].value = (event.target as HTMLInputElement)?.value;
      this.applyFilter();
    }
  }

  updateData(): void {
    //tableのデータソース更新
    this.dataSource = new MatTableDataSource<mwI.Edahlp>(this.memsrv.edas);
    this.dataSource.paginator = this.paginator() ?? null;
  }
  selEda(selected: mwI.Edahlp) {
    // console.log("select",selected);
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }

}