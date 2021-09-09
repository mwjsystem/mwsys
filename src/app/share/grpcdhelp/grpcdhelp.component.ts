import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { Ggrp,GoodsService } from './../../services/goods.service';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-grpcdhelp',
  templateUrl: './grpcdhelp.component.html',
  styleUrls: ['./grpcdhelp.component.scss']
})
export class GrpcdhelpComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<Ggrp>;
  displayedColumns = ['code','name','kana','gkbn','sozai','vcode','tcode']; 
  public filters: any = [{id:'code',value:''},
                         {id:'kana',value:''},
                         {id:'name',value:''},
                        ];
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  }); 
  constructor(private dialogRef: MatDialogRef<GrpcdhelpComponent>,
              public usrsrv: UserService,
              public gdssrv: GoodsService,
              public bunsrv: BunruiService,
              private apollo: Apollo,
              private overlay: Overlay) {
                this.dataSource= new MatTableDataSource<Ggrp>(this.gdssrv.ggrps);
               }

  ngOnInit(): void {
    if (this.gdssrv.ggrps.length == 0) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
      this.gdssrv.get_ggroups().then(result => {
        this.dataSource= new MatTableDataSource<Ggrp>(this.gdssrv.ggrps);
        this.overlayRef.detach();      
      });
    }
    this.dataSource.paginator = this.paginator;
    this.dataSource.filterPredicate = (data: Ggrp, filtersJson: string) => {
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
  setGrpcd(selected ) {
    // console.log("select",selected);
    // this.mcdsrv.mcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    // this.mcdsrv.mcds=[];
    this.dialogRef.close();
  }

}
