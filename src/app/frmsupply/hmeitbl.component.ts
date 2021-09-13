import { Component, OnInit, Input, ViewChild, ViewChildren, QueryList, ElementRef, ChangeDetectorRef } from '@angular/core';
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
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-hmeitbl',
  templateUrl: './hmeitbl.component.html',
  styleUrls: ['./hmeitbl.component.scss']
})
export class HmeitblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  @ViewChildren('gcdInputs') gcdInps: QueryList<ElementRef>;
  private el: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard: string;
  navCli=navigator.clipboard;
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
                      'unit',
                      'mbiko',
                      'spec',
                      'jdenno',
                      'jline',
                      'day',
                      'yday',
                      'ydaykbn',
                      'inday',
                      'mtax',
                      // 'currency'
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
    // let lcttotal:number=0;
    let lctax:number=0;
    this.frmArr.controls
      .forEach(control => {
        if(control.value.gcode!==''){
          const lcmoney:number = control.value.genka * control.value.suu;
          control.patchValue({money:lcmoney});
          lcgtotal += lcmoney;
          if(control.value.mtax=='0'){
            // lcttotal += lcmoney;
            lctax += (lcmoney * +control.value.taxrate / 100)
            // console.log(lctax);
          }
        }
      })
    this.parentForm.patchValue({gtotal:lcgtotal,tax:lctax,total:lcgtotal + lctax});
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

  // contxtMenu(i: number){
  //   this.gcdHelp(i);
  //   return false;
  // }

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
        unit
        ordering
        gskbn
        zkbn
        msgtankas(limit:1,where: {day: {_lt: $day}}, order_by: {day: desc_nulls_last}) {
          genka
          taxrate
          currency
        }
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetGood, 
        variables: { 
          id : this.usrsrv.compid,           
          gds: val,
          day: this.parentForm.get('day').value
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let msgds = data.msgoods_by_pk;
        
        if(msgds == null){
          this.toastr.warning("商品コード" + val+ "は登録されていません");
          this.frmArr.controls[i].get('gcode').setErrors({'incorrect': true});
        }else{
        // console.log(msgds);
          this.frmArr.controls[i].get('gcode').setErrors(null);
          this.frmArr.controls[i].patchValue(msgds);
          this.frmArr.controls[i].patchValue(msgds.msgtankas[0]);
          this.frmArr.controls[i].patchValue({day:this.parentForm.get('day').value,mtax:this.parentForm.get('mtax').value});
          this.calcTot();
        }
        this.hmisrv.subject.next(true);
      },(error) => {
        console.log('error query get_good', error);
      });
  } 

  createRow(i:number,hatmei?:mwI.Hatmei){
    return this.fb.group({
      chk:[''],
      line:[{value:i,disabled:true}],
      // soko:[hatmei.soko],
      gcode:[hatmei?.gcode, Validators.required],
      gtext:[hatmei?.gtext],
      suu:[hatmei?.suu, Validators.required],
      genka:[hatmei?.genka],
      money:[hatmei?.money],
      taxrate:[hatmei?.taxrate],
      unit:[hatmei?.unit],
      mbiko:[hatmei?.mbiko],
      spec:[hatmei?.spec],
      jdenno:[hatmei?.jdenno],
      jline:[hatmei?.jline],
      day:[hatmei?.day],
      yday:[hatmei?.yday],
      ydaykbn:[hatmei?.ydaykbn],
      inday:[hatmei?.inday],
      mtax:[hatmei?.mtax],
      // currency:[hatmei?.currency]
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
    // console.log(this.parentForm);    
    return this.parentForm.get('mtbl') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
  }
  pasteFromClipboard(flg:boolean){
    // if(navigator.clipboard){
    navigator.clipboard.readText()
    .then((text) => {
      console.log(text);
        let rowData = text.split("\n");
        this.insRows(rowData,flg);
        this.parentForm.markAsDirty();
    });
    // }
  }
  // pasteData(event: ClipboardEvent,flg:boolean) {
  //   let clipboardData = event.clipboardData;
  //   let pastedText = clipboardData.getData("text");
  //   let rowData = pastedText.split("\n");
  //   this.insRows(rowData,flg);
  //   this.parentForm.markAsDirty();
  //   // console.log(rowData);
  // }
  insRows(rowData,flg:boolean){
    let i:number=0;
    if(flg){
      this.frmArr.clear();
    }else{
      i=this.frmArr.length;
    }
    rowData.forEach(row => {
      let col=row.split("\t");
      if(col[0]!=""){
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
            unit:'',
            mbiko:'',
            spec:'',
            jdenno:+col?.[2],
            jline:+col?.[3],
            yday:null,
            ydaykbn:'',
            inday:null,
            mtax:'',
            // currency:''
        } 
        this.frmArr.push(this.createRow(i+1,hmei));
        // console.log(this.updateRow(i+1,hmei));
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
  get_hatmei(dno){
    let hatmei=[];
    this.frmArr.controls
      .forEach(control => {
        hatmei.push({
          id: this.usrsrv.compid,
          denno:dno,
          line: this.usrsrv.editFrmval(control,'line'),
          day: this.usrsrv.editFrmval(control,'day'),
          inday: this.usrsrv.editFrmval(control,'inday'),
          gcode: this.usrsrv.editFrmval(control,'gcode'),
          gtext: this.usrsrv.editFrmval(control,'gtext'),
          suu: this.usrsrv.editFrmval(control,'suu'),
          genka: this.usrsrv.editFrmval(control,'genka'),
          money: this.usrsrv.editFrmval(control,'money'),
          taxrate: this.usrsrv.editFrmval(control,'taxrate'),
          // unit: this.usrsrv.editFrmval(control,'unit'),
          mbiko: this.usrsrv.editFrmval(control,'mbiko'),
          spec: this.usrsrv.editFrmval(control,'spec'),
          jdenno: this.usrsrv.editFrmval(control,'jdenno'),
          jline: this.usrsrv.editFrmval(control,'jline'),
          yday: this.usrsrv.editFrmval(control,'yday'),
          ydaykbn: this.usrsrv.editFrmval(control,'ydaykbn'),
          mtax: this.usrsrv.editFrmval(control,'mtax')
        });
      });
      return hatmei;
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

  set_hatmei(){
    this.frmArr.clear();
    let i:number=0;
    // console.log(this.hmisrv.hatmei);
    this.hmisrv.hatmei.forEach(e => {
      this.frmArr.push(this.createRow(i+1,e));
      i+=1;
    });
    this.refresh();
  }

  add_newrow(i:number){
    
    this.gcdInps.changes.pipe(take(1)).subscribe({
      next: changes => {
        changes.last.nativeElement.focus()
        // console.log(changes.last);
        }
    })
    // console.log(i,this.frmArr.length);
    if (i+1 == this.frmArr.length){
      this.frmArr.push(this.createRow(i+2));
    }
    this.refresh();
    // console.log(this.gcdInps);
    // this.gcdInps.last.nativeElement.focus();
    // ((this.frmArr.at(i+1) as FormGroup).controls['gcode']as any).nativeElement = this.elementRef.nativeElement;
    // ((this.frmArr.at(i+1) as FormGroup).controls['gcode']as any).nativeElement.focus();
  }

}
