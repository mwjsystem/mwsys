import { Component, OnInit, ViewChild, HostListener, ElementRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap  } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';
import { VendsService } from './../services/vends.service';
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
              private vensrv: VendsService,
              private apollo: Apollo,
              private toastr: ToastrService) {
      this.title.setTitle('仕入先マスタ(MWSystem)') 
  }

  ngOnInit(): void {
    this.vensrv.get_vendors();
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
      tanto: new FormControl(''),
      url: new FormControl(''),
      kana: new FormControl(''),
    });

    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('mode') === null){
        this.mode = 3;
      }else{
        this.mode = +params.get('mode');
      } 
      if (params.get('vcd') !== null){
        this.vcd = params.get('vcd');
        this.get_vendor();
      }
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
    const GetMast = gql`
    query get_vendor($id: smallint!,$vcd: String!)  {
      msvendor_by_pk( id: $id,code: $vcd) {
        code
        adrname
        kana
        tel
        tel2
        tel3
        fax
        mail1
        mail2
        mail3
        mail4
        mail5
        tanto
        url
        del
        ftel
        zip
        region
        local
        created_at
        updated_at
        created_by
        updated_by
      }
    }`;
    this.apollo.watchQuery<any>({
        query: GetMast, 
        variables: { 
          id : this.usrsrv.compid,
          vcd :this.vcd
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.form.patchValue(data.msvendor_by_pk);
        console.log(data.msvendor_by_pk);
        this.usrsrv.setTmstmp(data.msvendor_by_pk); 
        history.replaceState('','','./mstvendor/' + this.mode + '/' + this.vcd);
        if(this.mode==3){
       　　this.form.disable();
        }else{
       　　this.form.enable();
        }
      },(error) => {
        console.log('error query get_vendor', error);
      });
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
