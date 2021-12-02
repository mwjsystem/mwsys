import { Component, OnInit, AfterViewInit, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.mstg';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { GoodsService } from './goods.service';
import { BunruiService } from './../services/bunrui.service';
import { GzaiComponent } from './../share/gzai/gzai.component';

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
  @Output() action = new EventEmitter();
  dataSource = new MatTableDataSource();
  displayedColumns =['action','gcode','gtext','size','color','unit','gskbn','jan','weight','tkbn','max','send','ordering','koguchi','lot'];
  hidx=6; //tabindex用ヘッダ項目数
  mcols=11; //tabindex用明細列数  
  constructor(private cdRef:ChangeDetectorRef,
              private fb:     FormBuilder,
              private dialog: MatDialog,
              private apollo: Apollo,
              private toastr: ToastrService,
              public usrsrv:UserService,
              public gdssrv:GoodsService,
              public bunsrv:BunruiService) {
                // this.dataSource.paginator = this.paginator;
  }

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    // this.dataSource.paginator = this.paginator;
  }
  
  del_row(row:number){
    this.frmArr.removeAt(row);
    this.action.emit({flg:false,row:row});//mstgoods.componentのメソッドins_throwに渡す引数
    this.refresh();
  }
  ins_row(flgCP:boolean,row:number){
    if(flgCP){
      this.frmArr.insert(row,this.createRow(false,this.frmArr.controls[row-1].value));
    }else{
      this.frmArr.insert(row,this.createRow(false));
    }
    this.action.emit({flg:true,row:row,flgCP:flgCP});//mstgoods.componentのメソッドins_throwに渡す引数
    this.parentForm.markAsDirty();
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
  diaGzai(i:number){
    let dialogConfig = new MatDialogConfig();
    const gcd:string=this.frmArr.controls[i].value.gcode;
    dialogConfig.data = {
      gcode: gcd
    };
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GzaiComponent, dialogConfig);     
  }

  get frmArr():FormArray {    
    return this.parentForm.get('mtbl') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
  }

　updGds(i: number,value: string){
    let val:string =this.usrsrv.convUpper(value);  //小文字全角→大文字半角変換
    this.frmArr.controls[i].get('gcode').setValue(val);
    this.apollo.watchQuery<any>({
      query: Query.GetMast2, 
        variables: { 
          id : this.usrsrv.compid,
          grpcd: this.gdssrv.grpcd,
          gcode: value
        },
      }).valueChanges
        .subscribe(({ data }) => {  
          if(data.msgoods.length==0){
            this.frmArr.controls[i].get('gcode').setErrors(null);
            let j:number=0;
            this.frmArr.controls
              .forEach(control => {
                // console.log(control.get('gcode').value,control);
                if(control.get('gcode').value == value && j != i){

                  this.toastr.error( value + 'は重複しています(' + (j+1) + '行目)','商品コード入力エラー',
                                  {closeButton: true,disableTimeOut: true,tapToDismiss: false,positionClass: 'toast-top-left'});
                  this.frmArr.controls[i].get('gcode').setErrors({'exist': true});
                }
                j+=1;
              });
          } else {
            this.toastr.error( value + 'は商品ｸﾞﾙｰﾌﾟ' + data.msgoods[0].msggroup.code + 'で登録済です','商品コード入力エラー',
                      {closeButton: true,disableTimeOut: true,tapToDismiss: false,positionClass: 'toast-top-left'});
            this.frmArr.controls[i].get('gcode').setErrors({'exist': true});
          }
      });  
  (this.parentForm.get('mtbl2') as FormArray).controls[i].get('gcode').setValue(val);
  }
  createRow(flg:boolean,goods?:mwI.Goods){
    return this.fb.group({
      ins:[flg],
      gcode:[{value:goods?.gcode,disabled:flg}],
      gtext:[goods?.gtext],
      size:[goods?.size],
      color:[goods?.color],
      unit:[goods?.unit],
      gskbn:[goods?.gskbn],
      jan:[goods?.jan],
      weight:[goods?.weight],
      tkbn:[goods?.tkbn ?? '0'],
      // zkbn:[goods?.zkbn ?? '0'],
      max:[goods?.max],
      send:[goods?.send],
      ordering:[goods?.ordering],
      koguchi:[goods?.koguchi],
      lot:[goods?.lot]
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

  getIdx(index : number)    {
    if(this.paginator){
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else{
      return index;
    }
  }

  setBgcolor(tkbn: string): string {
    let color:string;
    if ( tkbn == '9' ){ 
      color = 'lightgray';
    } else {
      color = 'transparent'; 
    }
    return color;
  } 

}
