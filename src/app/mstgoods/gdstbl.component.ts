import { Component, OnInit, AfterViewInit, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { GoodsService } from './../services/goods.service';
import { BunruiService } from './../services/bunrui.service';

@Component({
  selector: 'app-gdstbl',
  templateUrl: './gdstbl.component.html',
  styleUrls: ['./gdstbl.component.scss']
})
export class GdstblComponent implements OnInit,AfterViewInit {
  @Input() parentForm: FormGroup;
  private paginator: MatPaginator;
  @ViewChild(MatPaginator, {static: false}) set matPaginator(mp: MatPaginator) {
    this.paginator = mp;
    this.dataSource.paginator = this.paginator;
  }
  // @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  @Output() action = new EventEmitter();
  dataSource = new MatTableDataSource();
  displayedColumns =['action','gcode','gtext','size','color','irisu','iriunit','gskbn','jan','weight','tkbn','zkbn','max','send','ordering','koguchi'];
  hidx=6; //tabindex用ヘッダ項目数
  mcols=11; //tabindex用明細列数  
  constructor(private cdRef:ChangeDetectorRef,
              private fb:     FormBuilder,
              private toastr: ToastrService,
              public usrsrv:UserService,
              public gdssrv:GoodsService,
              public bunsrv:BunruiService) {
                this.dataSource.paginator = this.paginator;
                // console.log(this.paginator);
  }

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    this.dataSource.paginator = this.paginator;
    // console.log(this.paginator);
    // console.log(this.bunsrv.gskbn);
  }
  
  del_row(row:number){
    this.frmArr.removeAt(row);
    this.action.emit({flg:false,row:row});
    this.refresh();
  }
  ins_row(row:number){
    // console.log(row);
    this.frmArr.insert(row,this.createRow(false));
    this.action.emit({flg:true,row:row});
    // (this.parentForm.get('mtbl2') as FormArray).insert(row,this.gdssrv.createRow());
    // console.log(this.frmArr);
    // console.log((this.parentForm.get('mtbl2') as FormArray));
    // this.gdssrv.subTnk.next(true);
    // this.gdssrv.subTnk.complete();
    this.refresh();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    // console.log(this.paginator);
  }

  add_rows(rows:number){
    for (let i=0;i<rows;i++){
      this.frmArr.push(this.createRow(false));
    }
    this.refresh();
  }  
  getGzai(gcd:string):string{
    // console.log(gcd);
    let tooltip:string="";
    const i:number = this.gdssrv.goods.findIndex(obj => obj.gcode == gcd);
    if (i>-1){
      this.gdssrv.goods[i].msgzais.forEach(e => {
        tooltip += e.zcode + '_'.repeat(25-e.zcode.length) + e.irisu + '\n';
      });
    }
    
    return tooltip;
  }
  async setJan(i:number){
    this.frmArr.controls[i].get('jan').setValue(this.usrsrv.addCheckDigit(await this.usrsrv.getNumber('jan',1)));
  }
  diaGzai(){
    
  }

  get frmArr():FormArray {    
    return this.parentForm.get('mtbl') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
  }

　updGds(i: number,value: string){
    this.frmArr.controls
      .forEach(control => {
        console.log(control.get('gcode').value);
        if(control.get('gcode').value == value){

          // this.toastr.error('商品コード入力エラー', value + 'は重複しています(' + '行目)',
          //                 {closeButton: true,disableTimeOut: true,tapToDismiss: false});
          // // console.log(control.value);
          // control.patchValue({spec:kbn});
          // i+=1;
          // if(kbn=="3" && this.hatden.indexOf(control.value.vcode) == -1){
          //   this.hatden.push(control.value.vcode);
          // }
        }
      });
    (this.parentForm.get('mtbl2') as FormArray).controls[i].get('gcode').setValue(value);
  }
  createRow(flg:boolean,goods?:mwI.Goods){
    return this.fb.group({
      ins:[flg],
      gcode:[{value:goods?.gcode,disabled:!flg}],
      gtext:[goods?.gtext],
      size:[goods?.size],
      color:[goods?.color],
      irisu:[goods?.irisu ?? 1],
      iriunit:[goods?.iriunit],
      gskbn:[goods?.gskbn],
      jan:[goods?.jan],
      weight:[goods?.weight],
      tkbn:[goods?.tkbn ?? '0'],
      zkbn:[goods?.zkbn ?? '0'],
      max:[goods?.max],
      send:[goods?.send],
      ordering:[goods?.ordering],
      koguchi:[goods?.koguchi]
    });
  }    
      
  set_goods(){
    this.frmArr.clear();
    this.gdssrv.goods.forEach(e => {
      this.frmArr.push(this.createRow(true,e));
    });
    this.refresh();
  }

  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data =  this.frmArr.controls;
  }

  getActualIndex(index : number)    {
    if(this.paginator){
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else{
      return index;
    }
  }

}
