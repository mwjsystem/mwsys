import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.mstg';
import { ToastrService } from 'ngx-toastr';
import { GdstblComponent } from './gdstbl.component';
import { UserService } from './../services/user.service';
import { GoodsService } from './../services/goods.service';
import { BunruiService } from './../services/bunrui.service';


interface Ggrp {
  code:string;
  name:string;
  kana:string;
} 

@Component({
  selector: 'app-mstgoods',
  templateUrl: './mstgoods.component.html',
  styleUrls: ['./mstgoods.component.scss'],
  encapsulation : ViewEncapsulation.None
})
export class MstgoodsComponent implements OnInit {
  @ViewChild(GdstblComponent ) gdstbl:GdstblComponent;

  form: FormGroup;
  ggrps: Ggrp[]=[];
  grpcd:string;
  mode:number=3;
  rows: FormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(private fb: FormBuilder,
    private title: Title,
    private route: ActivatedRoute,
    private elementRef: ElementRef,
    private dialog: MatDialog,
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    private gdssrv: GoodsService,
    private apollo: Apollo,
    private toastr: ToastrService,
    private overlay: Overlay) {
     this.title.setTitle('商品マスタ');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      kana: new FormControl('', Validators.required),
      name: new FormControl('', Validators.required),
      gkbn: new FormControl('', Validators.required),
      bikou: new FormControl(''),
      sozai: new FormControl(''),
      siire: new FormControl(''),
      mtbl: this.rows 
    });
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('grpcd') === null){
        // this.grpcd = '読込中です！';
      }else{
        //１件分だけ先に読込
        this.grpcd = params.get('grpcd');
        this.get_ggroup(this.grpcd);
      }
      if (params.get('mode') === null){
        this.mode = 3;
      }else{
        this.mode = +params.get('mode');
      } 
    });
    this.bunsrv.get_bunrui();
    this.get_ggroups();
  }  

  ngAfterViewInit(): void{
    setTimeout(() => {
      this.refresh();
    });
  }

  onEnter(): void {
    this.elementRef.nativeElement.querySelector('button').focus();
  }  

  grpcdHelp(): void {
    
  }  

  get_ggroup(grpcd:string){
    // this.grpcd += '　読込中';
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: Query.GetMast1, 
        variables: { 
          id : this.usrsrv.compid,
          grpcd: grpcd
        },
    })
      .valueChanges
      .subscribe(({ data }) => {      
      this.form.reset();
      if (data.msggroup_by_pk == null){
        this.grpcd = grpcd + '　未登録';
        history.replaceState('','','./mstgoods');
      } else {
        let ggroup:mwI.Ggroup=data.msggroup_by_pk;
        this.form.patchValue(ggroup);
        this.usrsrv.setTmstmp(ggroup);
        this.gdssrv.goods=[];
        this.gdssrv.gtnks=[];
　　　　 for(let i=0;i<ggroup.msgoods.length;i++){
          // console.log('get_ggroup '+i,ggroup.msgoods[i]);
          const {msgtankas,...good}=ggroup.msgoods[i];// ggroup.msgoods[i]からmsgtankasを除外して、goodに代入         
          this.gdssrv.goods.push(good);
          for(let j=0;j<ggroup.msgoods[i].msgtankas.length;j++){         
            this.gdssrv.gtnks.push(Object.assign({gcode:ggroup.msgoods[i].gcode},ggroup.msgoods[i].msgtankas[j]));
          }
          // console.log('get_ggroup',this.gdssrv.goods);
        }
        this.gdssrv.subGds.next();
        this.gdssrv.subTnk.next(); 
        this.gdstbl.set_goods();
      }
      this.grpcd = grpcd;
      this.overlayRef.detach();
      history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
    },(error) => {
      this.grpcd = grpcd + '　読込エラー';
      this.form.reset();
      console.log('error query get_ggroup', error);
      history.replaceState('','','./mstgoods');
      this.overlayRef.detach();
    }); 
  }  
  get_ggroups():void {
    if (this.ggrps.length == 0) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
      this.apollo.watchQuery<any>({
        query: Query.GetMast0, 
          variables: { 
            id : this.usrsrv.compid
          },
        })
        .valueChanges
        .subscribe(({ data }) => {
            // if(this.grpcd=='読込中です！'){
            //   this.grpcd="";
            // }
            this.ggrps=data.msggroup;
            this.overlayRef.detach();
        },(error) => {
          console.log('error query get_ggroups', error);
          this.overlayRef.detach();
        });
    }  
  }
  refresh():void {
    if( this.checkMcode(this.grpcd) ){
      this.get_ggroup(this.grpcd);
    }
    if(this.mode==3){
      this.form.disable();
    }else{
      this.form.enable();
    }
  }

  checkMcode(grpcd:string):boolean {
    // console.log(typeof mcode,mcode);
    let flg:boolean; 
    if (grpcd != null){
      let i:number = this.ggrps.findIndex(obj => obj.code == grpcd);
      if( i > -1 ){
        flg = true;
      } else {
        if( grpcd.indexOf('未登録') == -1 && grpcd.indexOf('読込') == -1 && grpcd !== '' ){
          this.grpcd = grpcd + '　未登録';
        }
        this.form.reset();
        history.replaceState('','','./mstgoods'); 
        flg = false;
      }
    }else{  
      flg=false;
    }
    return flg;
  }
  
  test(value){
    this.toastr.info('機能作成中');
    console.log(this.bunsrv.gskbn);
  }


  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.form.enable();
    this.grpcd="新規登録"; 
  }

  modeToUpd():void {
    this.mode=2;
    this.form.enable();
    history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
  }

  save():void {

  } 
  
  cancel():void {
    this.mode=3;
    this.form.disable();
    this.form.markAsPristine();
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
