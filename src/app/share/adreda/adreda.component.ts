import { Component, OnInit, Inject, ViewChild, AfterViewInit } from '@angular/core';
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
  mcode: number;
  mode:number=3;
  form: FormGroup;
  eda:number|string;
  constructor(private fb: FormBuilder,
              public edasrv: EdaService,
              private dialogRef: MatDialogRef<AdredaComponent>,
              @Inject(MAT_DIALOG_DATA) data,
              private dialog: MatDialog,
              private usrsrv: UserService,
              private apollo: Apollo) { 
                this.mcode=data.mcode;
                this.mode =data.mode;
                this.eda =data.eda;
              }

  ngOnInit(): void {
    this.form = this.fb.group({});
    if(this.edasrv.adrs.length>0 && this.eda == null ){
      // console.log(this.edasrv);
      this.eda=this.edasrv.adrs[0].eda;
    } else {
      // this.mode=1;
      this.form.reset();
      // this.form.enable();
      // this.eda="新規登録";
    } 
  }

  ngAfterViewInit(): void{
    setTimeout(() => {
      this.refresh();
    });
  }

  close() {
    this.dialogRef.close(this.eda);
  }

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.form.enable();
    this.eda="新規登録";
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
      this.eda='';
    }
    this.mode=3;
    this.form.disable();
  }

  setNext(){
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.eda);
    if(i > -1 && i < this.edasrv.adrs.length){
      this.eda = this.edasrv.adrs[i+1].eda;
    }
    this.refresh();
  }

  setPrev(){
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.eda);
    if(i > 0 ){
      this.eda = this.edasrv.adrs[i-1].eda;
    }
    this.refresh();
  }

  refresh():void {
    let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.eda);
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
}
