import { Component, OnInit, Input, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { MembsService } from './../../mstmember/membs.service';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";

@Component({
    selector: 'app-edahelp',
    templateUrl: './edahelp.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class EdahelpComponent implements OnInit {
  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;
  public filters: any = [{ id: 'adrname', value: '' },
  { id: 'region', value: '' },
  { id: 'local', value: '' },
  { id: 'tel', value: '' },
  ];
  dataSource: MatTableDataSource<mwI.Edahlp>;
  displayedColumns = ['eda', 'adrname', 'zip', 'region', 'local', 'street', 'extend', 'extend2', 'tel'];

  constructor(public memsrv: MembsService,
    private dialogRef: MatDialogRef<EdahelpComponent>) {
    this.dataSource = new MatTableDataSource<mwI.Edahlp>(this.memsrv.edas);
  }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;
    // this.edasrv.observe.subscribe();
    this.dataSource.filterPredicate = (data: mwI.Edahlp, filtersJson: string) => {
      const matchFilter: any[] = [];
      const filters = JSON.parse(filtersJson);
      filters.forEach((filter: { id: string | number; value: string; }) => {
        const val = (data as any)[filter.id] === null ? '' : (data as any)[filter.id];
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
    this.dataSource.paginator = this.paginator;
  }
  selEda(selected: any) {
    // console.log("select",selected);
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }

}