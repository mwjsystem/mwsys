import { Component, OnInit, Input, ViewChild, Output, EventEmitter } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { Edahlp, EdaService } from './eda.service';

@Component({
  selector: 'app-edatbl',
  templateUrl: './edatbl.component.html',
  styleUrls: ['./edatbl.component.scss']
})
export class EdatblComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  @Output() seteda = new EventEmitter();
  public filters: any = [{id:'adrname',value:''},
                         {id:'region',value:''},
                         {id:'local',value:''},
                         {id:'tel',value:''},
                        ];
  dataSource:MatTableDataSource<Edahlp>;
  displayedColumns = ['eda','adrname','zip','region','local','street','extend','extend2','tel']; 
  constructor(public edasrv:EdaService) {
    this.dataSource= new MatTableDataSource<Edahlp>(this.edasrv.edas);
  }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;    
    this.edasrv.observe.subscribe();
    this.dataSource.filterPredicate = (data: Edahlp, filtersJson: string) => {
      const matchFilter = [];
      const filters = JSON.parse(filtersJson);
      filters.forEach(filter => {
        const val = data[filter.id] === null ? '' : data[filter.id];
        matchFilter.push(val.toLowerCase().includes(filter.value.toLowerCase()));
      });
      return matchFilter.every(Boolean);
    };
  }
  
  setEda(row){
    this.edasrv.selro = row;
    this.seteda.emit(this.edasrv.selro);
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

  updateData(): void {
    //tableのデータソース更新
    this.dataSource= new MatTableDataSource<Edahlp>(this.edasrv.edas);
    this.dataSource.paginator = this.paginator;
  }  

}
