import { Component, OnInit, AfterViewInit, ChangeDetectorRef, ElementRef, ViewEncapsulation, HostListener, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap  } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.mstg';
import { ToastrService } from 'ngx-toastr';
import { GdstblComponent } from './gdstbl.component';
import { GtnktblComponent } from './gtnktbl.component';
import { GrpcdhelpComponent } from './../share/grpcdhelp/grpcdhelp.component';
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { GdsimageComponent } from './../share/gdsimage/gdsimage.component';
import { UserService } from './../services/user.service';
import { GoodsService } from './../services/goods.service';
import { BunruiService } from './../services/bunrui.service';
import { VendsService } from './../services/vends.service';

@Component({
  selector: 'app-mstgoods',
  templateUrl: './mstgoods.component.html',
  styleUrls: ['./../app.component.scss'],
  encapsulation : ViewEncapsulation.None
})
export class MstgoodsComponent implements OnInit {
  @ViewChild(GdstblComponent) gdstbl:GdstblComponent;
  @ViewChild(GtnktblComponent) gtnktbl:GtnktblComponent;

  form: FormGroup;
  grpcd:string;
  mode:number=3;
  rows: FormArray = this.fb.array([]);
  rows2: FormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(private fb: FormBuilder,
    private title: Title,
    public cdRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    public vensrv: VendsService,
    private gdssrv: GoodsService,
    private apollo: Apollo,
    private toastr: ToastrService,
    private overlay: Overlay) {
     this.title.setTitle('商品マスタ(MWSystem)');
  }

  ngOnInit(): void {
    this.vensrv.get_vendors();
    this.bunsrv.get_bunrui();
    this.form = this.fb.group({
      kana: new FormControl('', Validators.required),
      name: new FormControl('', Validators.required),
      gkbn: new FormControl('', Validators.required),
      bikou: new FormControl(''),
      sozai: new FormControl(''),
      vcode: new FormControl(''),
      genre: new FormControl(''),
      specurl: new FormControl(''),
      mtbl: this.rows,
      mtbl2: this.rows2 
    });
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('grpcd') != null){
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
    if (this.gdssrv.ggrps.length == 0) {
      if(!this.overlayRef) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.gdssrv.get_ggroups().then(result => {
        this.overlayRef.detach();      
      });
    }
  }  

　diaImage(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.data = {
        grpcd: this.grpcd,
        url:this.form.value.specurl
    };
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GdsimageComponent, dialogConfig); 
  }

  grpcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GrpcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data=>{
        if(typeof data != 'undefined'){
          this.grpcd = data.code;
        }
        this.refresh();
      }
    );    
  }  

  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data=>{
        if(typeof data != 'undefined'){
          this.form.get('vcode').setValue(data.code);
          this.cdRef.detectChanges();
        }
      }
    );    
  } 

  get_ggroup(grpcd:string){
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: Query.GetMast0, 
        variables: { 
          id : this.usrsrv.compid,
          code: grpcd
        },
    }).valueChanges
      .subscribe(({ data }) => {
      if (data.msggroup.length == 0){
        this.form.reset();
          history.replaceState('','','./mstgoods');
          this.overlayRef.detach();
        if(this.mode>1){
          this.toastr.warning("商品コード、グループコードどちらでも登録されていません");
        }        
      } else {
        let lcgrpcd = data.msggroup[0].code;
        if(this.mode==1){
          this.toastr.warning("商品グループコード" + lcgrpcd + "は登録済です。新規登録ボタンからやり直してください");
          this.mode=3;
        }  
        this.apollo.watchQuery<any>({
          query: Query.GetMast1, 
            variables: { 
              id : this.usrsrv.compid,
              grpcd: lcgrpcd
            },
        }).valueChanges
          .subscribe(({ data }) => {      
          this.form.reset();
          let ggroup:mwI.Ggroup=data.msggroup_by_pk;
          this.form.patchValue(ggroup);
          this.usrsrv.setTmstmp(ggroup);
          this.gdssrv.goods=[];
          this.gdssrv.gtnks=[];
    　　　　 for(let i=0;i<ggroup.msgoods.length;i++){
            const {msgtankas,...good}=ggroup.msgoods[i];// ggroup.msgoods[i]からmsgtankasを除外して、goodに代入         
            this.gdssrv.goods.push(good);
            for(let j=0;j<ggroup.msgoods[i].msgtankas.length;j++){         
              this.gdssrv.gtnks.push(Object.assign({gcode:ggroup.msgoods[i].gcode},ggroup.msgoods[i].msgtankas[j]));
            }
          }
          // this.gdssrv.subGds.next();
          // this.gdssrv.subGds.complete();
          // this.gdssrv.subTnk.next();
          // this.gdssrv.subTnk.complete();
          this.gdstbl.set_goods();
          this.gtnktbl.set_gtanka();
          if(this.mode==3){
            this.form.disable();
          }else{
            this.form.enable();
          }
          this.grpcd = lcgrpcd;
          this.overlayRef.detach();
          this.cdRef.detectChanges();
          history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
        },(error) => {
          this.toastr.error("読込エラーです。ブラウザを再起動しても直らなければ、連絡を！");
          this.form.reset();
          console.log('error query get_ggroup', error);
          history.replaceState('','','./mstgoods');
          this.overlayRef.detach();
        });       
      }
    }); 
  }  
  
  refresh():void {
    if( this.grpcd ){
      this.get_ggroup(this.grpcd);
    }
  }

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.form.enable();
    // this.grpcd="新規登録"; 
  }

  modeToUpd():void {
    this.mode=2;
    this.form.enable();
    history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
  }

  save():void {
    
    //★upsertに変える！！
    let ggroup:any={
      id: this.usrsrv.compid,
      code: this.grpcd,
      kana: this.usrsrv.editFrmval(this.form,'kana'),
      name: this.usrsrv.editFrmval(this.form,'name'),
      gkbn: this.usrsrv.editFrmval(this.form,'gkbn'),
      bikou: this.usrsrv.editFrmval(this.form,'bikou'),
      sozai: this.usrsrv.editFrmval(this.form,'sozai'),
      vcode: this.usrsrv.editFrmval(this.form,'vcode'),
      tcode: this.usrsrv.editFrmval(this.form,'tcode'),
      specurl: this.usrsrv.editFrmval(this.form,'specurl'),
      genre: this.usrsrv.editFrmval(this.form,'genre'),
      updated_at:new Date(),
      updated_by:this.usrsrv.staff.code
    };
    if(this.mode==2){      
      this.apollo.mutate<any>({
        mutation: Query.UpdateMast1,
        variables: {
          id: this.usrsrv.compid,
          grpcd: this.grpcd,
          "_set": ggroup
        },
      }).subscribe(({ data }) => {
        this.toastr.success('商品グループ' + this.grpcd + 'の変更を保存しました');
        this.mode=3;
        this.form.disable();
        this.form.markAsPristine();
      },(error) => {
        this.toastr.error('データベースエラー','商品グループ' + this.grpcd + 'の変更保存ができませんでした',
                          {closeButton: true,disableTimeOut: true,tapToDismiss: false});
        console.log('error update_msggroup', error);
      });

      console.log(this.form.get('mtbl'));
    }else{//新規登録

    }










  } 
  
  cancel():void {
    if(this.mode==1){
      this.grpcd='';
    }
    this.mode=3;
    this.form.disable();
    this.form.markAsPristine();
    history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
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
  ins_tnkrow(i){
    this.gtnktbl.ins_row(i);
  }

}
