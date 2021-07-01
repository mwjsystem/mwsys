import { Component, OnInit, Input, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { SoukoService } from './../services/souko.service';
import { GoodsService } from './../services/goods.service';
import { JyumeiService } from './jyumei.service';
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-jmeitbl',
  templateUrl: './jmeitbl.component.html',
  styleUrls: ['./jmeitbl.component.scss'],
  changeDetection:ChangeDetectionStrategy.OnPush
})
export class JmeitblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  private el: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard:string;
  jmeikbn:string;
  hatden=[];
  hidx=20;
  mcols=5;
  displayedColumns = ['chk',
                      'line',
                      'gcode',
                      'gtext',
                      'suu',
                      'iriunit',
                      'teika',
                      'rate',
                      'tanka',
                      'money',
                      'mtax',
                      'taxmoney',
                      // 'tintanka',
                      // 'touttanka',
                      'tinmoney',
                      // 'toutmoney',
                      'spec',
                      'spdet',
                      'mbikou',
                      'zaiko',
                      'jyuzan',
                      'genka',
                      'souko',
                      'taxrate'];

  constructor(private cdRef:ChangeDetectorRef,
              private elementRef: ElementRef,
              private dialog: MatDialog,
              private fb:     FormBuilder,
              private apollo: Apollo,
              private toastr: ToastrService,
              public usrsrv: UserService,
              public bunsrv: BunruiService,
              public soksrv: SoukoService,
              public gdssrv: GoodsService,
              public jmisrv:  JyumeiService) {}

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    // console.log(this.parentForm);
  }

  setAll(chked:boolean){
    this.frmArr.controls
      .forEach(control => {
        if(control.value.gcode!==''){
          control.patchValue({chk:chked});
        }
      })
    this.refresh();
  }

  async setJmeikbn(kbn:string){
    let i:number=0;
    // console.log(kbn);
    if (this.parentForm.value.jdstatus==null){
      this.parentForm.get('jdstatus').setValue("0");
    }
    this.frmArr.controls
      .forEach(control => {
        if(control.value.chk){
          control.patchValue({spec:kbn});
          i+=1;
          if(kbn=="3" && this.hatden.indexOf(control.value.vcode) == -1){
            this.hatden.push(control.value.vcode);
          }
        }
      })
    this.refresh();
    this.toastr.info(i + '件変更しました。まだ、保存されていません。');
  }

　async toFrmsup() {
    this.jmisrv.denno = await this.jmisrv.get_denno();
    let hdno = await this.usrsrv.getNumber('hdenno',1);
    let jmei=[];
    this.frmArr.controls
      .forEach(control => {
        if(control.value.vcode==this.hatden[0]){
          console.log(control);
          jmei.push(control.value.gcode + "\t" + control.value.suu + "\t" 
                    + this.jmisrv.denno + "\t" + control.get('line').value);
          control.patchValue({spdet:hdno});        
        }
      })  
    localStorage.setItem(this.jmisrv.denno + 'MWSYS_FRMSUPPLY', 
                         JSON.stringify({vcd:this.hatden[0],
                                         mei:jmei}));
    this.usrsrv.openFrmsup(hdno,this.jmisrv.denno + 'MWSYS_FRMSUPPLY');
    this.hatden.shift();
  }

  del_row(row:number){
    this.frmArr.removeAt(row);
    this.auto_fil();  
  }
  ins_row(row:number){
    this.frmArr.insert(row,this.createRow(row));
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
  add_rows(rows:number){
    for (let i=0;i<rows;i++){
      this.frmArr.push(this.createRow(i+1));
    }
    this.refresh();
  }
  updateRow(i:number,jyumei:mwI.Jyumei){
    return this.fb.group({
      chk:[''],
      line:[{value:i,disabled:true}],
      day:[jyumei.day],
      sday:[jyumei.sday],
      souko:[jyumei.souko],
      gcode:[jyumei.gcode],
      gtext:[jyumei.gtext],
      suu:[jyumei.suu],
      iriunit:[jyumei.iriunit],
      teika:[{value:jyumei.teika,disabled:true}],
      tanka:[jyumei.tanka],
      money:[{value:jyumei.money,disabled:true}],
      mtax:[jyumei.mtax],
      mbikou:[jyumei.mbikou],
      zaiko:[{value:jyumei.zaiko,disabled:true}],
      jyuzan:[{value:jyumei.jyuzan,disabled:true}],
      genka:[jyumei.genka],
      spec:[jyumei.spec],
      tintanka:[jyumei.tintanka],
      touttanka:[jyumei.touttanka],
      taxtanka:[jyumei.taxtanka],
      tinmoney:[{value:jyumei.tinmoney,disabled:true}],
      toutmoney:[jyumei.toutmoney],
      taxmoney:[jyumei.taxmoney],
      taxrate:[jyumei.taxrate],
      code:[jyumei.code],
      gkbn:[jyumei.gkbn],
      vcode:[jyumei.vcode],
      spdet:[jyumei.spdet]    
    });
  }

  createRow(i:number){
    return this.fb.group({
      chk:[''],
      line:[{value:i,disabled:true}],
      day:[''],
      sday:[''],
      souko:[''],
      gcode:[''],
      gtext:[''],
      suu:[''],
      iriunit:[''],
      teika:[{value:'',disabled:true}],
      tanka:[''],
      money:[{value:'',disabled:true}],
      mtax:[''],
      mbikou:[''],
      zaiko:[{value:'',disabled:true}],
      jyuzan:[{value:'',disabled:true}],
      genka:[''],
      spec:[''],
      tintanka:[''],
      touttanka:[''],
      taxtanka:[''],
      tinmoney:[{value:'',disabled:true}],
      toutmoney:[''],
      taxmoney:[''],
      taxrate:[''],
      code:[''],
      gkbn:[''],
      vcode:[''],
      spdet:['']    
    });
  }

  contxtMenu(i: number){
    this.gcdHelp(i);
    return false;
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

  updGds(i: number,value: string):void {
    let val:string =this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('gcode').setValue(val);
    this.apollo.watchQuery<any>({
      query: Query.GetGood, 
        variables: { 
          id : this.usrsrv.compid,           
          gds: val,
          day: this.parentForm.value.day
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let msgds = data.msgoods_by_pk;
        if(msgds == null){
          this.toastr.warning("商品コード" + val+ "は登録されていません");
        }else{
          this.frmArr.controls[i].patchValue(msgds);
          this.frmArr.controls[i].patchValue(msgds.msggroup);
          this.frmArr.controls[i].patchValue(msgds.msgtankas[0]);
          let lctanka:number=0;
          let j:number = msgds.msgsptnks.findIndex(obj => obj.sptnkbn == this.jmisrv.sptnkbn );
          if(j>-1){
            lctanka=msgds.msgsptnks[j].sptanka;
          }else{
            lctanka=msgds.msgtankas[0]['tanka' + this.jmisrv.tankakbn];
          }
          this.frmArr.controls[i].patchValue({mtax:this.jmisrv.mtax,
                                              teika:msgds.msgtankas[0]['tanka1'],
                                              tanka:lctanka});
          if(this.frmArr.controls[i].value.souko != null){
            this.frmArr.controls[i].patchValue({souko:this.jmisrv.souko});
          }
          if(msgds.ordering){
            this.frmArr.controls[i].patchValue({spec:'3'});
            if(this.hatden.indexOf(msgds.msggroup.vcode) == -1){
              this.hatden.push(msgds.msggroup.vcode);
            }
          }
          this.jmisrv.subject.next(true);
          // this.jmisrv.subject.complete();
        }
        
      },(error) => {
        console.log('error query get_good', error);
      });
  } 

  updateList(i: number, fld: string){
    // this.jmisrv.jyumei[i][property] = value;
    // this.frmArr.at(i)['controls'][fld].setvalue();
    // console.log(this.frmArr.at(i)['controls'][fld]);
    // this.refresh();
  }
  get frmArr():FormArray {    
    return this.parentForm.get('mtbl') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
  }
  pasteData(event: ClipboardEvent) {
    let clipboardData = event.clipboardData;
    let pastedText = clipboardData.getData("text");
    let rowData = pastedText.split("\n");
    this.insRows(rowData);
    // console.log(rowData);
  }

  insRows(rowData){
    this.frmArr.clear();
    let i:number=0;
    rowData.forEach(row => {
      let col=row.split("\t");
      if(col[1]!==null){
        let jmei:mwI.Jyumei= {
            line:i,
            day:this.parentForm.get('day').value,
            sday:null,
            souko:this.parentForm.get('souko').value,
            gcode:col[0],
            gtext:'',
            suu:+col[1],
            iriunit:null,
            teika:0,
            tanka:(col[2] ?? +col[2]),
            money:0,
            mtax:null,
            mbikou:null,
            zaiko:0,
            jyuzan:0,
            genka:0,
            spec:null,
            tintanka:0,
            touttanka:0,
            taxtanka:0,
            tinmoney:0,
            toutmoney:0,
            taxmoney:0,
            taxrate:null,
            currency:null,
            code:null,
            gkbn:null,
            vcode:null,
            spdet:null
          } 
          this.frmArr.push(this.updateRow(i+1,jmei));
          this.updGds(i,col[0]);
          i+=1;
      };
    });
    this.refresh();
  }
  copyData() {
    this.copyToClipboard = this.objectToArray(this.displayedColumns);
    this.frmArr.getRawValue().forEach(row => {
      if(row.gcode !=='' ){
        this.copyToClipboard += this.objectToArray(row);
      }
    })
    this.toastr.info('クリップボードにコピーしました');
  }

  objectToArray(obj: object): string {
    var result = Object.keys(obj).map((key: keyof typeof obj) => {
      let value = obj[key];
      // console.log(value)
      return value;
    });
    // console.log(result.toString())
    return result.toString() + "\n";
  }
  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data =  this.frmArr.controls;
  }

  set_jyumei(){
    this.frmArr.clear();
    let i:number=0;
    this.jmisrv.jyumei.forEach(e => {
      // console.log(e);
      this.frmArr.push(this.updateRow(i+1,e));
      i+=1;
    });
    for(let j=i+1;j<21;j++){
      this.frmArr.push(this.createRow(j));
    }
    this.refresh();
  }
}
