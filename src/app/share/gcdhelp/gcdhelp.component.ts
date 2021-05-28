import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import { UserService } from './../../services/user.service';
import { Gcd,GcdService } from './gcd.service';

@Component({
  selector: 'app-gcdhelp',
  templateUrl: './gcdhelp.component.html',
  styleUrls: ['./gcdhelp.component.scss']
})
export class GcdhelpComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<Gcd>;
  displayedColumns = ['code','gcode','gtext','size','color','jan','irisu','iriunit','gskbn','tkbn','zkbn'];
  public filters: any = [{id:'code',value:''},
                         {id:'jan',value:''},
                         {id:'name',value:''},
                        ];
  constructor(private dialogRef: MatDialogRef<GcdhelpComponent>,
              public usrsrv: UserService,
              public gcdsrv: GcdService,
              private apollo: Apollo) {
                this.dataSource= new MatTableDataSource<Gcd>(this.gcdsrv.gcds); }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.filterPredicate = (data: Gcd, filtersJson: string) => {
      const matchFilter = [];
      const filters = JSON.parse(filtersJson);
      filters.forEach(filter => {
        const val = data[filter.id] === null ? '' : data[filter.id];
        matchFilter.push(val.toLowerCase().includes(filter.value.toLowerCase()));
      });
      return matchFilter.every(Boolean);
    };
  }

  applyFilter():void {
    this.dataSource.filter = JSON.stringify(this.filters);
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }
  updateFilter(fldid: string, filval: string) :void{
    let i:number = this.filters.findIndex(obj => obj.id == fldid);
    this.filters[i].value = filval;
    this.applyFilter();
  }
  setGcd(selected ) {
    this.dialogRef.close(selected);
  }

  close() {
    // this.mcdsrv.mcds=[];
    this.dialogRef.close();
  }

}
