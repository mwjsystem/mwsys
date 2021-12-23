import { Component, OnInit, Inject, ChangeDetectorRef, HostListener } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { ToastrService } from 'ngx-toastr';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GoodsService } from './../../mstgoods/goods.service';
import { UserService } from './../../services/user.service';
import { GcdhelpComponent } from './../gcdhelp/gcdhelp.component';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';

@Component({
  selector: 'app-gzai',
  templateUrl: './gzai.component.html',
  styleUrls: ['./gzai.component.scss']
})
export class GzaiComponent implements OnInit {
  form: FormGroup;
  mode:number=3;
  gcode:string;
  dataSource = new MatTableDataSource();
  displayedColumns =['line','zcode','gtext','irisu','unit'];
  constructor(private fb: FormBuilder,
              private dialogRef: MatDialogRef<GzaiComponent>,
              private dialog: MatDialog,
              private apollo: Apollo,
              private toastr: ToastrService,
              public usrsrv: UserService,
              public gdssrv: GoodsService,
              public cdRef: ChangeDetectorRef,
              @Inject(MAT_DIALOG_DATA) data) {
                this.form = this.fb.group({mtbl:this.fb.array([])});
                this.gcode=data.gcode;
                const i:number = this.gdssrv.goods.findIndex(obj => obj.gcode == this.gcode);
                this.gdssrv.goods[i].msgzais.forEach(e => {
                  this.frmArr.push(this.fb.group({
                    line:[{value:0,disabled:true}],
                    zcode:[e.zcode],
                    gtext:[{value:e.msgoods.gtext,disabled:true}],
                    irisu:[e.irisu],
                    unit:[{value:e.msgoods.unit,disabled:true}]
                  }));
                });
                this.auto_fil();
              }

  ngOnInit(): void {}
  get frmArr():FormArray {    
    return this.form.get('mtbl') as FormArray;
  }  
  del_row(row:number){
    this.frmArr.removeAt(row);
    this.auto_fil();  
  }
  ins_row(row:number){
    this.frmArr.insert(row,this.fb.group({
      line:[{value:0,disabled:true}],
      zcode:[""],
      gtext:[{value:"",disabled:true}],
      irisu:[0],
      unit:[{value:"",disabled:true}]
    }));
    this.auto_fil();  
  } 
  auto_fil(){
    let i:number=0;
    this.frmArr.controls
      .forEach(control => {
        control.patchValue({line:i+1});
        i=i+1;
      })
    this.refresh();
  }  
  modeToUpd():void {
    this.mode=2;
    this.refresh();
  }
  cancel():void {
    this.mode=3;
    this.form.markAsPristine();
    this.refresh();
  }
  updGds(i: number,value: string):void {
    let val:string =this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('zcode').setValue(val);
    const GetMast = gql`
    query get_goods($id: smallint!, $gcode: String!) {
      msgoods_by_pk(id:$id, gcode:$gcode) {
        gtext
        unit
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast, 
        variables: { 
          id : this.usrsrv.compid,           
          gcode: val
        }
      })
    .valueChanges
    .subscribe(({ data }) => {
      // console.log(data.msgoods_by_pk);
      this.frmArr.controls[i].patchValue(data.msgoods_by_pk);
    },(error) => {
      this.toastr.warning("商品コード" + val+ "は登録されていません");
      this.frmArr.controls[i].get('zcode').setErrors({'incorrect': true});      
      console.log('error query get_goods', error);
    });
  }   
  gcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass= 'full-screen-modal';
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.updGds(i,data.gcode);
          }
      }
    );
  }
  save(){
    const UpdateTran = gql`
      mutation upd_msgzai($id: smallint!, $gcd: String!,$obj:[msgzai_insert_input!]!) {
        delete_msgzai(where: {id: {_eq:$id},gcode: {_eq:$gcd}}) {
          affected_rows
        }
        insert_msgzai(objects: $obj) {
          affected_rows
        }
      }`;
    let objGzai=[];
    let gzai=[]
    this.frmArr.controls
    .forEach(control => {
      objGzai.push({
        id: this.usrsrv.compid,
        gcode: this.gcode,
        zcode: this.usrsrv.editFrmval(control,'zcode'),
        irisu: this.usrsrv.editFrmval(control,'irisu'),
      });
      gzai.push({
        zcode: control.value.zcode,
        irisu: control.value.irisu,
        msgoods:{gtext: control.value.gtext,
                 unit : control.value.unit}
      });
    });
    this.apollo.mutate<any>({
      mutation: UpdateTran,
      variables: {
        id: this.usrsrv.compid,
        gcd: this.gcode,
        obj: objGzai
      },
    }).subscribe(({ data }) => { 
      this.toastr.success('セット商品内訳を更新しました');
      this.form.markAsPristine();
      this.cancel();
      const i:number = this.gdssrv.goods.findIndex(obj => obj.gcode == this.gcode);
      // console.log(this.frmArr.controls);
      this.gdssrv.goods[i].msgzais=gzai;
    },(error) => {
      this.toastr.error('データベースエラー','セット商品内訳の更新ができませんでした',
                        {closeButton: true,disableTimeOut: true,tapToDismiss: false});
      console.log('error mutation upd_msgzai', error);        
    }); 



  }
  refresh(): void {
    this.dataSource.data=this.frmArr.controls;
    if(this.mode==3){
      this.form.disable();
    }else{
      this.form.enable();
    }
    // this.cdRef.detectChanges();  
  }
  getInvalid():string{
    let tooltip:string="";
    return tooltip;
  }
  close() {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.dialogRef.close();
    }
  }  
  shouldConfirmOnBeforeunload():boolean {
    return this.form.dirty;
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }
}
