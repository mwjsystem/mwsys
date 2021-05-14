import { Component, OnInit, Input, ViewChild ,AfterViewChecked, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { UserService } from './../services/user.service';
import { GoodsService } from './../services/goods.service';
import { BunruiService } from './../services/bunrui.service';

@Component({
  selector: 'app-gdstbl',
  templateUrl: './gdstbl.component.html',
  styleUrls: ['./gdstbl.component.scss']
})
export class GdstblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource = new MatTableDataSource();
  displayedColumns =['gcode','gtext','size','color','irisu','iriunit','gskbn','jan','weight','tkbn','zkbn','max','send','order','koguchi'];
  
  constructor(private cdRef:ChangeDetectorRef,
              private fb:     FormBuilder,
              public usrsrv:UserService,
              public gdssrv:GoodsService,
              public bunsrv:BunruiService) {

  }

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    // console.log(this.bunsrv.gskbn);
  }

  ngAfterViewChecked(): void {
    this.cdRef.detectChanges();
  }

  add_rows(rows:number){
    for (let i=0;i<rows;i++){
      this.frmArr.push(this.createRow(i+1));
    }
    this.refresh();
  }  
  getGzai(gcd:string):string{
    // console.log(gcd);
    let tooltip:string="";
    const i:number = this.gdssrv.goods.findIndex(obj => obj.gcode == gcd);
    this.gdssrv.goods[i].msgzais.forEach(e => {
      tooltip += e.zcode + '_'.repeat(25-e.zcode.length) + e.irisu + '\n';
    });
    return tooltip;
  }
  setJan(i:number){
    this.usrsrv.getNumber('jan',1).subscribe(value => {
      // console.log(value);
      this.frmArr.controls[i].get('jan').setValue(this.usrsrv.addCheckDigit(value));
    });
  }
  diaGzai(){
    
  }

  get frmArr():FormArray {    
    return this.parentForm.get('mtbl') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
  }

  updateRow(i:number,goods:mwI.Goods){
    return this.fb.group({
      gcode:[goods.gcode],
      gtext:[goods.gtext],
      size:[goods.size],
      color:[goods.color],
      irisu:[goods.irisu],
      iriunit:[goods.iriunit],
      gskbn:[goods.gskbn],
      jan:[goods.jan],
      weight:[goods.weight],
      tkbn:[goods.tkbn],
      zkbn:[goods.zkbn],
      max:[goods.max],
      send:[goods.send],
      order:[goods.order],
      koguchi:[goods.koguchi]
    });
  }
  createRow(i:number){
    return this.fb.group({
      gcode:[''],
      gtext:[''],
      size:[''],
      color:[''],
      irisu:[''],
      iriunit:[''],
      gskbn:[''],
      jan:[''],
      weight:[''],
      tkbn:[''],
      zkbn:[''],
      max:[''],
      send:[''],
      order:[''],
      koguchi:['']
    });
  }     
      
  set_goods(){
    this.frmArr.clear();
    let i:number=0;
    this.gdssrv.goods.forEach(e => {
      this.frmArr.push(this.updateRow(i+1,e));
      i+=1;
    });
    // for(let j=i+1;j<11;j++){
    //   this.frmArr.push(this.createRow(j));
    // }
    this.refresh();
  }

  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data =  this.frmArr.controls;
  }

}
