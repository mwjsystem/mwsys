import { Component, OnInit, Input, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { UserService } from './../services/user.service';
import { SoukoService } from './../services/souko.service';
import { HatmeiService } from './hatmei.service';
import { Apollo } from 'apollo-angular';

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
  displayedColumns = ['line',
                      'day',
                      'inday',
                      'soko',
                      'gcode',
                      'gtext',
                      'suu',
                      'tanka',
                      'money',
                      'mtax',
                      'taxrate',
                      'iriunit',
                      'mbiko',
                      'spec',
                      'jdenno',
                      'jline',
                      'yday',
                      ];
  constructor(private cdRef:ChangeDetectorRef,
              private elementRef: ElementRef,
              private dialog: MatDialog,
              private fb:     FormBuilder,
              private apollo: Apollo,
              public usrsrv: UserService,
              public hmisrv: HatmeiService,
              public soksrv: SoukoService) { }

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    // console.log(this.parentForm);
  }

  updateList(i: number, fld: string,value){
    // this.jmisrv.jyumei[i][property] = value;
    // this.frmArr.at(i)['controls'][fld].setvalue();
    // console.log(this.frmArr.at(i)['controls'][fld]);
    // this.refresh();
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
    // let val:string =this.usrsrv.convUpper(value);
    // this.frmArr.controls[i].get('gcode').setValue(val);
    // this.apollo.watchQuery<any>({
    //   query: Query.GetGood, 
    //     variables: { 
    //       id : this.usrsrv.compid,           
    //       gds: val,
    //       day: this.parentForm.value.day
    //     },
    //   })
    //   .valueChanges
    //   .subscribe(({ data }) => {
    //     let msgds = data.msgoods_by_pk;
    //     // console.log(msgds);
    //     this.frmArr.controls[i].patchValue(msgds);
    //   },(error) => {
    //     console.log('error query get_good', error);
    //   });
  } 

  updateRow(i:number,hatmei:mwI.Hatmei){
    return this.fb.group({
      line:[{value:i,disabled:true}],
      day:[hatmei.day],
      inday:[hatmei.inday],
      soko:[hatmei.soko],
      gcode:[hatmei.gcode],
      gtext:[hatmei.gtext],
      suu:[hatmei.suu],
      tanka:[hatmei.tanka],
      money:[hatmei.money],
      mtax:[hatmei.mtax],
      taxrate:[hatmei.taxrate],
      iriunit:[hatmei.iriunit],
      mbiko:[hatmei.mbiko],
      spec:[hatmei.spec],
      jdenno:[hatmei.jdenno],
      jline:[hatmei.jline],
      yday:[hatmei.yday],
    });
  }
 
  createRow(i:number){
    return this.fb.group({
      line:[{value:i,disabled:true}],
      day:[''],
      inday:[''],
      soko:[''],
      gcode:[''],
      gtext:[''],
      suu:[''],
      tanka:[''],
      money:[''],
      mtax:[''],
      taxrate:[''],
      iriunit:[''],
      mbiko:[''],
      spec:[''],
      jdenno:[''],
      jline:[''],
      yday:[''],
    });
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
