import { Component, OnInit, Input, ViewChild ,AfterViewChecked, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { SoukoService } from './../services/souko.service';
import { GoodsService } from './../services/goods.service';
import { JyumeiService } from './jyumei.service';
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';

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
  displayedColumns = ['line',
                      'gcode',
                      'gtext',
                      'teika',
                      'tanka',
                      'suu',
                      'iriunit',
                      'money',
                      'taxkbn',
                      'taxmoney',
                      // 'tintanka',
                      // 'touttanka',
                      'tinmoney',
                      // 'toutmoney',
                      'spec',
                      'mbikou',
                      'genka',
                      'souko',
                      'taxrate'];

  constructor(private cdRef:ChangeDetectorRef,
              private elementRef: ElementRef,
              private fb:     FormBuilder,
              private apollo: Apollo,
              public usrsrv: UserService,
              public bunsrv: BunruiService,
              public soksrv: SoukoService,
              public gdssrv: GoodsService,
              public jmisrv:  JyumeiService) {}

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
  }

  ngAfterViewChecked(): void {
    this.cdRef.detectChanges();
  }

  add_rows(rows:number){
    for (let i=0;i<rows;i++){
      this.frmArr.push(this.createRow(i+1));
    }
  }  

  updateRow(i:number,jyumei:mwI.Jyumei){
    return this.fb.group({
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
      taxkbn:[jyumei.taxkbn],
      mbikou:[jyumei.mbikou],
      genka:[jyumei.genka],
      spec:[jyumei.spec],
      tintanka:[jyumei.tintanka],
      touttanka:[jyumei.touttanka],
      taxtanka:[jyumei.taxtanka],
      tinmoney:[{value:jyumei.tinmoney,disabled:true}],
      toutmoney:[jyumei.toutmoney],
      taxmoney:[jyumei.taxmoney],
      taxrate:[jyumei.taxrate]
    })
  }

  createRow(i:number){
    return this.fb.group({
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
      taxkbn:[''],
      mbikou:[''],
      genka:[''],
      spec:[''],
      tintanka:[''],
      touttanka:[''],
      taxtanka:[''],
      tinmoney:[{value:'',disabled:true}],
      toutmoney:[''],
      taxmoney:[''],
      taxrate:['']
    })
  }

  updGds(i: number,value: string):void {
    let val:string =this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('gcode').setValue(val);
    this.apollo.watchQuery<any>({
      query: Query.GetMast9, 
        variables: { 
          id : this.usrsrv.compid,           
          gds: val,
          day: this.parentForm.value.day
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let msgds = data.msgoods_by_pk;
        // console.log(msgds);
        this.frmArr.controls[i].patchValue(msgds);
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
  // onFocus(i: number, val){
  //   this.el = this.elementRef.nativeElement;
  //   // val = val + 1;
  //   console.log((<any>this.frmArr.controls[i].get('tanka')).nativeElement,this.el);
  // }

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

  set_jyumei(){
    this.frmArr.clear();
    let i:number=0;
    this.jmisrv.jyumei.forEach(e => {
      this.frmArr.push(this.updateRow(i+1,e));
      i+=1;
    });
    for(let j=i+1;j<21;j++){
      this.frmArr.push(this.createRow(j));
    }
    this.refresh();
  }
}
