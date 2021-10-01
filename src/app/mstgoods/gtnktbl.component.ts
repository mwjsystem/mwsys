import { Component, OnInit, AfterViewInit, Input, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { UserService } from './../services/user.service';
import { GoodsService } from './/goods.service';
import { BunruiService } from './../services/bunrui.service';

@Component({
  selector: 'app-gtnktbl',
  templateUrl: './gtnktbl.component.html',
  styleUrls: ['./gdstbl.component.scss']
})
export class GtnktblComponent implements OnInit,AfterViewInit {
  @Input() parentForm: FormGroup;
  private paginator: MatPaginator;
  @ViewChild(MatPaginator, {static: false}) set matPaginator(mp: MatPaginator) {
    this.paginator = mp;
    this.dataSource.paginator = this.paginator;
  }
  dataSource = new MatTableDataSource();
  displayedColumns =['gcode','day','tanka1',
                      'tanka2','tnk2',
                      'tanka3','tnk3',
                      'tanka4','tnk4',
                      'tanka5','tnk5',
                      'tanka6','tnk6',
                      'tanka7','tnk7',
                      'tanka8','tnk8',
                      'tanka9','tnk9',
                      'cost','genka','taxrate','currency'];
  hidx=10000; //tabindex用ヘッダ項目数
  mcols=14; //tabindex用明細列数  
  constructor(public bunsrv: BunruiService,
              private cdRef:ChangeDetectorRef,
              private fb:     FormBuilder,
              public usrsrv: UserService,
              public gdssrv: GoodsService
    ) {
                this.dataSource.paginator = this.paginator;

    }

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    this.dataSource.paginator = this.paginator;
  }
  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    // console.log(this.paginator);
  }
  del_row(row:number){
    this.frmArr.removeAt(row);
    this.refresh();
  }
  ins_row(row:number,flgCp){
    // console.log(row,value);
    if(flgCp){
      this.frmArr.insert(row,this.createRow(this.frmArr.controls[row-1].value));
    } else {
      this.frmArr.insert(row,this.createRow());
    }
    this.refresh();
  }
  add_rows(rows:number){
    for (let i=0;i<rows;i++){
      this.frmArr.push(this.createRow());
    }
    this.refresh();
  }  
  createRow(gtanka?:mwI.Gtanka){
    return this.fb.group({
      gcode:[gtanka?.gcode],
      day:[gtanka?.day],
      tanka1:[gtanka?.tanka1],
      tanka2:[gtanka?.tanka2],
      tanka3:[gtanka?.tanka3],
      tanka4:[gtanka?.tanka4],
      tanka5:[gtanka?.tanka5],
      tanka6:[gtanka?.tanka6],
      tanka7:[gtanka?.tanka7],
      tanka8:[gtanka?.tanka8],
      tanka9:[gtanka?.tanka9],
      currency:[gtanka?.currency],
      cost:[gtanka?.cost],
      genka:[gtanka?.genka],
      taxrate:[gtanka?.taxrate]
    });
  }
 
  get frmArr():FormArray {    
    return this.parentForm.get('mtbl2') as FormArray;
  }  
  
  // frmVal(i:number,fld:string):string {
  //   return this.frmArr.getRawValue()[i][fld];
  // }

  get_teika(i:number):number{
    // console.log(this.frmArr.getRawValue()[this.getIdx(i)]['tanka1']*(+this.usrsrv.system.mtax)/(100 + +this.frmArr.getRawValue()[this.getIdx(i)]['taxrate'])*10);
    return this.frmArr.getRawValue()[i]['tanka1'] -
          (this.frmArr.getRawValue()[i]['tanka1']*(+this.usrsrv.system.mtax)/(100 + +this.frmArr.getRawValue()[i]['taxrate'])*10);
  }
  set_gtanka(){
    this.frmArr.clear();
    this.gdssrv.gtnks.forEach(e => {
      this.frmArr.push(this.createRow(e));
    });
    // for(let j=i+1;j<11;j++){
    //   this.frmArr.push(this.createRow(j));
    // }
    this.refresh();
  }

  getIdx(index : number)    {
    if(this.paginator){
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else{
      return index;
    }
  }
  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data = this.frmArr.controls;
  }
}
