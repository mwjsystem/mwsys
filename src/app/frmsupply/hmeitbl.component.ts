import { Component, OnInit, Input, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { SoukoService } from './../services/souko.service';
import { HatmeiService } from './hatmei.service';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-hmeitbl',
  templateUrl: './hmeitbl.component.html',
  styleUrls: ['./hmeitbl.component.scss']
})
export class HmeitblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  private el: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard: string;
  yday:Date;
  displayedColumns = ['chk',
                      'line',
                      // 'soko',
                      'gcode',
                      'gtext',
                      'suu',
                      'genka',
                      'money',
                      'taxrate',
                      'iriunit',
                      'mbiko',
                      'spec',
                      'jdenno',
                      'jline',
                      'day',
                      'yday',
                      'ydaykbn',
                      'inday',
                      'mtax'
                      ];
  constructor(private cdRef:ChangeDetectorRef,
              private elementRef: ElementRef,
              private dialog: MatDialog,
              private fb:     FormBuilder,
              private apollo: Apollo,
              private toastr: ToastrService,
              public usrsrv: UserService,
              public bunsrv: BunruiService,
              public hmisrv: HatmeiService,
              public soksrv: SoukoService) { }

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    // console.log(this.parentForm);
  }

  calcTot(){
    let lcgtotal:number=0;
    let lcttotal:number=0;
    let lctax:number=0;
    this.frmArr.controls
      .forEach(control => {
        if(control.value.gcode!==''){
          const lcmoney:number = control.value.genka * control.value.suu;
          control.patchValue({money:lcmoney});
          lcgtotal += lcmoney;
          if(control.value.mtax=='0'){
            lcttotal += lcmoney;
            lctax += (lcmoney * +control.value.taxrate / 100)
            console.log(lctax);
          }
        }
      })
    this.parentForm.patchValue({gtotal:lcgtotal,ttotal:lcttotal,tax:lctax,total:lcgtotal + lctax});
    this.hmisrv.subject.next(true);
    this.hmisrv.subject.complete();
    this.refresh();
    // console.log(this.frmArr,this.parentForm);
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

  setYday(ydkbn:string){
    let i:number=0;
    this.frmArr.controls
      .forEach(control => {
        if(control.value.chk){
          control.patchValue({yday:this.yday,ydaykbn:ydkbn});
          i+=1;
        }
      })
    this.refresh();
    this.toastr.info(i + '件変更しました。まだ、保存されていません。');
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
    // console.log(this.frmArr.controls[i]);
    this.frmArr.controls[i].get('gcode').setValue(val);
    const GetGood = gql`
    query get_good($id: smallint!,$gds:String!,$day: date!) {
      msgoods_by_pk(gcode: $gds, id: $id){
        msggroup {
          code
          gkbn
          vcode
        }
        gcode
        gtext
        iriunit
        ordering
        gskbn
        zkbn
        msgtankas_aggregate(where: {day: {_lt: $day}}) {
          aggregate {
            max {
              day
            }
          }
        }
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetGood, 
        variables: { 
          id : this.usrsrv.compid,           
          gds: val,
          day: this.frmArr.controls[i].get('day').value
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let msgds = data.msgoods_by_pk;
        // console.log(msgds);
        this.frmArr.controls[i].patchValue(msgds);
        this.calcTot();
      },(error) => {
        console.log('error query get_good', error);
      });
  } 

  updateRow(i:number,hatmei:mwI.Hatmei){
    return this.fb.group({
      chk:[''],
      line:[{value:i,disabled:true}],
      // soko:[hatmei.soko],
      gcode:[hatmei.gcode],
      gtext:[hatmei.gtext],
      suu:[hatmei.suu],
      genka:[hatmei.genka],
      money:[hatmei.money],
      taxrate:[hatmei.taxrate],
      iriunit:[hatmei.iriunit],
      mbiko:[hatmei.mbiko],
      spec:[hatmei.spec],
      jdenno:[hatmei.jdenno],
      jline:[hatmei.jline],
      day:[hatmei.day],
      yday:[hatmei.yday],
      ydaykbn:[hatmei.ydaykbn],
      inday:[hatmei.inday],
      mtax:[hatmei.mtax]
    });
  }
 
  createRow(i:number){
    return this.fb.group({
      chk:[''],
      line:[{value:i,disabled:true}],
      // soko:[''],
      gcode:[''],
      gtext:[''],
      suu:[''],
      genka:[''],
      money:[''],
      taxrate:[''],
      iriunit:[''],
      mbiko:[''],
      spec:[''],
      jdenno:[''],
      jline:[''],
      day:[''],
      yday:[''],
      ydaykbn:[''],
      inday:[''],
      mtax:['']
    });
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
        let hmei:mwI.Hatmei= {
            line:i,
            day:this.usrsrv.formatDate(),
            // soko:this.parentForm.get('soko').value,
            gcode:col[0],
            gtext:'',
            suu:+col[1],
            genka:0,
            money:0,
            taxrate:'',
            iriunit:'',
            mbiko:'',
            spec:'',
            jdenno:(col[2] ?? +col[2]),
            jline:(col[3] ?? +col[3]),
            yday:null,
            ydaykbn:'',
            inday:null,
            mtax:''
        } 
        this.frmArr.push(this.updateRow(i+1,hmei));
        // console.log(this.updateRow(i+1,hmei));
        this.updGds(i,col[0]);
        i+=1;
      };
    });
    this.refresh();  
  }
  copyData() {
    this.copyToClipboard = this.ObjectToArray(this.displayedColumns);
    this.frmArr.getRawValue().forEach(row => {
      if(row.gcode !=='' ){
        this.copyToClipboard += this.ObjectToArray(row);
      }
    })
    this.toastr.info('クリップボードにコピーしました');
  }

  ObjectToArray(obj: object): string {
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

  set_hatmei(){
    this.frmArr.clear();
    let i:number=0;
    this.hmisrv.hatmei.forEach(e => {
      this.frmArr.push(this.updateRow(i+1,e));
      i+=1;
    });
    for(let j=i+1;j<21;j++){
      this.frmArr.push(this.createRow(j));
    }
    this.refresh();
  }
}
