import { Component, OnInit, ViewChild, HostListener, ElementRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap  } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { ToastrService } from 'ngx-toastr';
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';

@Component({
  selector: 'app-mstvendor',
  templateUrl: './mstvendor.component.html',
  styleUrls: ['./mstvendor.component.scss']
})
export class MstvendorComponent implements OnInit {
  vcd: string;
  form: FormGroup;
  mode:number=3;
  
  constructor(private fb: FormBuilder,
    private title: Title,
    private route: ActivatedRoute,
    private elementRef: ElementRef,
    private dialog: MatDialog,
    public usrsrv: UserService,
    private apollo: Apollo,
    private toastr: ToastrService) {
      this.title.setTitle('仕入先マスタ(MWSystem)') 
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      zip: new FormControl(''),
      region: new FormControl(''),
      local: new FormControl(''),
      street: new FormControl(''),
      extend: new FormControl(''),
      tel: new FormControl(''),
      fax: new FormControl(''),
      tel2: new FormControl(''),
      tel3: new FormControl(''),
      extend2: new FormControl(''),
      adrname: new FormControl(''),
      adrbikou: new FormControl(''),
      adrinbikou: new FormControl(''),
      mail1: new FormControl(''),
      mail2: new FormControl(''),
      mail3: new FormControl(''),
      mail4: new FormControl(''),
      mail5: new FormControl(''),
      del: new FormControl(''),
      ftel: new FormControl(''),
      tanto: new FormControl(''),
      url: new FormControl(''),
      kana: new FormControl(''),
    });

  }

  onEnter(): void {
    this.elementRef.nativeElement.querySelector('button').focus();
  }  

  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data=>{
        if(typeof data != 'undefined'){
          this.vcd=data.code;
        }
        this.refresh();
      }
    );    
  } 

  get_vendor(){

　}

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.form.enable();
    this.vcd="新規登録"; 
  }

  modeToUpd():void {
    this.mode=2;
    this.form.enable();
    // history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
  }

  save():void {

  } 
  
  cancel():void {
    if(this.mode==1){
      this.vcd='';
    }
    this.mode=3;
    this.form.disable();
    this.form.markAsPristine();
    // history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
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

  refresh():void {
    if( this.vcd ){
      this.get_vendor();
    }
  }  

}
