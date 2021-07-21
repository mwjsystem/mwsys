import { Component, OnInit, Input, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { GoodsService } from './../services/goods.service';
import { BunruiService } from './../services/bunrui.service';

@Component({
  selector: 'app-gtnktbl',
  templateUrl: './gtnktbl.component.html',
  styleUrls: ['./gdstbl.component.scss']
})
export class GtnktblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource = new MatTableDataSource();
  displayedColumns =['gcode','day','tanka1','tanka2','tanka3','tanka4','tanka5','tanka6','tanka7','tanka8','tanka9','cost','genka','taxrate','currency'];


  constructor(public bunsrv: BunruiService,
              private cdRef:ChangeDetectorRef,
              private fb:     FormBuilder,
              public gdssrv: GoodsService
    ) {}

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
  }
  // ngAfterViewChecked(): void {
  //   setTimeout(() => {
  //     this.cdRef.detectChanges();
  //   });
  // }
  del_row(row:number){
    this.frmArr.removeAt(row);
    this.refresh();
  }
  ins_row(row:number){
    this.frmArr.insert(row,this.createRow());
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
  // createRow(){
  //   return this.fb.group({
  //     action:['ins'],
  //     gcode:[''],
  //     day:[''],
  //     tanka1:[''],
  //     tanka2:[''],
  //     tanka3:[''],
  //     tanka4:[''],
  //     tanka5:[''],
  //     tanka6:[''],
  //     tanka7:[''],
  //     tanka8:[''],
  //     tanka9:[''],
  //     cost:[''],
  //     genka:[''],
  //     taxrate:[''],
  //     currency:['']
  //   });
  // }  

  get frmArr():FormArray {    
    return this.parentForm.get('mtbl2') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
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

  refresh(): void {
    this.dataSource.data = this.frmArr.controls;
    this.dataSource.paginator = this.paginator;
    // this.cdRef.detectChanges();
    // console.log("tnk"+flg, this.frmArr.controls);
  }
}
