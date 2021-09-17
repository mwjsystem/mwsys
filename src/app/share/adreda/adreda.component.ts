import { Component, OnInit, Inject, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { EdaService } from './eda.service';
import { EdahelpComponent } from './edahelp.component';
import { AddressComponent } from './../address/address.component';


@Component({
  selector: 'app-adreda',
  templateUrl: './adreda.component.html',
  styleUrls: ['./adreda.component.scss']
})
export class AdredaComponent implements OnInit, AfterViewInit {
  @ViewChild( AddressComponent, {static: false} )
    private child: AddressComponent;
  mcode: string="";
  mode:number=3;
  form: FormGroup;
  eda:number|string;
  edaOld:number;
  flg:boolean;
  constructor(private fb: FormBuilder,
              public edasrv: EdaService,
              private dialogRef: MatDialogRef<AdredaComponent>,
              @Inject(MAT_DIALOG_DATA) data,
              private dialog: MatDialog,
              private cdRef: ChangeDetectorRef,
              private usrsrv: UserService,
              private apollo: Apollo) { 
                this.mcode=data.mcode;
                this.mode =data.mode;
                this.eda =data.eda;
                this.flg =data.flg;
              }

  ngOnInit(): void {
    this.form = this.fb.group({});

  }

  ngAfterViewInit(): void{
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda > 1);
    
    // console.log(i);
    if(i > -1 && ( this.eda == null || this.eda =='' ) ){
      this.eda=this.edasrv.adrs[i].eda;
    } else if ( this.eda == null ) {
      this.form.reset();
      // this.cdRef.detectChanges();
    } 
    // console.log(this.eda);
    this.refresh();
  }

  close() {
    this.dialogRef.close();
  }

  set_eda() {
    this.dialogRef.close(this.eda);
  }

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.form.enable();
    this.edaOld=+this.eda;
    this.eda="新規登録";
    const bikou={nbikou:this.edasrv.adrs[0].nbikou,
                 sbikou:this.edasrv.adrs[0].sbikou,
                 obikou:this.edasrv.adrs[0].obikou};
    this.form.get('addr').patchValue(bikou);

    // let tmp=this.edasrv.adrs[this.edasrv.adrs.length-1].eda;
    // if(tmp>9){
    //   this.eda=tmp + 1;
    // } else{
    //   this.eda=10;
    // }
  }

  modeToUpd():void {
    this.mode=2;
    this.form.enable();
  }

  save():void {
    this.child.saveMadr(this.edasrv.mcode,this.eda,this.mode).subscribe(neweda =>{
      this.eda=neweda;
      this.mode=3;
      this.form.disable();
      this.form.markAsPristine();
    });
  }
  cancel():void {
    if(this.mode==1){
      this.eda=this.edaOld;
    }
    this.mode=3;
    this.form.disable();
  }

  setNext(){
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.eda);
    if(i > -1 && i < this.edasrv.adrs.length - 1){
      this.eda = this.edasrv.adrs[i+1].eda;
    }
    this.refresh();
  }

  setPrev(){
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.eda);
    if(i > 0 && this.edasrv.adrs[i].eda > 10){
      this.eda = this.edasrv.adrs[i-1].eda;
    }
    this.refresh();
  }

  refresh():void {
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.eda);
    // console.log(i,this.eda);
    if(i > -1 ){
      let adrs:mwI.Adrs=this.edasrv.adrs[i];
      // console.log(adrs,this.form.get('addr'));
      this.form.get('addr').patchValue(adrs);
    }
    if(this.mode==3){
      this.form.disable();
    } else {
      this.form.enable();
    }
    this.cdRef.detectChanges();
  }

  edaHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(EdahelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.eda = data.eda;
          }
          this.refresh();
      }
    );
  }

  onEnter(): void {
    // this.elementRef.nativeElement.querySelector('button').focus();
    this.refresh();
  }

  getInvalid():string{
    let tooltip:string="";
    const ctrls=(this.form.controls['addr'] as FormGroup).controls;
    // console.log('addr',ctrls);
  　for (const name in ctrls){
      if(ctrls[name].invalid){
        // console.log('addr',name);
        tooltip += this.usrsrv.getColtxt('msmadr',name) + '⇒' + this.usrsrv.getValiderr(ctrls[name].errors) + '\n' ;
        // invalid.push(name + '_' + ctrls1[name].invalid);
      }
    }
    // console.log(tooltip);
    return tooltip;

  }

}
