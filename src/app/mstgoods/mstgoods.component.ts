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
import { GdsimageComponent } from './../share/gdsimage/gdsimage.component';
import { UserService } from './../services/user.service';
import { GoodsService } from './../services/goods.service';
import { BunruiService } from './../services/bunrui.service';

@Component({
  selector: 'app-mstgoods',
  templateUrl: './mstgoods.component.html',
  styleUrls: ['./mstgoods.component.scss'],
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
      genre: new FormControl(''),
      specurl: new FormControl(''),
      mtbl: this.rows,
      mtbl2: this.rows2 
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
    if (this.gdssrv.ggrps.length == 0) {
      if(!this.overlayRef) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.gdssrv.get_ggroups().then(result => {
        this.overlayRef.detach();      
      });
    }
    // this.bunsrv.get_bunrui();
  }  

  // ngAfterViewInit(): void{
  //   setTimeout(() => {
  //     this.refresh();
  //   });
  // }

  onEnter(): void {
    this.elementRef.nativeElement.querySelector('button').focus();
  }  

　diaImage(): void {
    let dialogConfig = new MatDialogConfig();
    // dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.data = {
        grpcd: this.grpcd,
        url:this.form.value.specurl
    };
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GdsimageComponent, dialogConfig);
    // dialogRef.afterClosed().subscribe(
    //   data=>{
    //     if(typeof data != 'undefined'){
    //       this.grpcd = data.code;
    //     }
    //   }
    // );    
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

  get_ggroup(grpcd:string){
    // this.grpcd += '　読込中';
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
      query: Query.GetMast0, 
        variables: { 
          id : this.usrsrv.compid,
          code: grpcd
        },
    }).valueChanges
      .subscribe(({ data }) => {
      if (data.msggroup == null){
        this.form.reset();
        this.grpcd = grpcd + '　未登録';
        history.replaceState('','','./mstgoods');
      } else {
        // console.log(data);
        let lcgrpcd = data.msggroup[0].code;
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
          this.gtnktbl.set_gtanka();
          if(this.mode==3){
            this.form.disable();
            // this.usrsrv.disable_mtbl(this.form);
          }else{
            this.form.enable();
            // this.usrsrv.enable_mtbl(this.form);
          }
          this.grpcd = lcgrpcd;
          this.overlayRef.detach();
          this.cdRef.detectChanges();
          history.replaceState('','','./mstgoods/' + this.mode + '/' + this.grpcd);
        },(error) => {
          this.grpcd = grpcd + '　読込エラー';
          this.form.reset();
          console.log('error query get_ggroup', error);
          history.replaceState('','','./mstgoods');
          this.overlayRef.detach();
        });       
      }
    }); 
  }  
  
  refresh():void {
    // if( this.checkMcode(this.grpcd) ){
      this.get_ggroup(this.grpcd);
    // }
  }

  // toTreat(){
  //   // const url = window.location.href + '/frmtreat?=' + this.grpcd;
  //   // console.log(url);
  //   // window.open(url,'_blank');
  // // 　this.router.navigate([./frmtreat])
  // }

  // checkMcode(grpcd:string):boolean {
  //   // console.log(typeof mcode,mcode);
  //   let flg:boolean; 
  //   if (grpcd != null){
  //     let lcgrpcd = this.usrsrv.convUpper(grpcd);
  //     let i:number = this.gdssrv.ggrps.findIndex(obj => obj.code == lcgrpcd);
  //     if( i > -1 ){
  //       this.grpcd = lcgrpcd;
  //       flg = true;
  //     } else {
  //       if( grpcd.indexOf('未登録') == -1 && grpcd.indexOf('読込') == -1 && grpcd !== '' ){
  //         this.grpcd = grpcd + '　未登録';
  //       }
  //       this.form.reset();
  //       history.replaceState('','','./mstgoods'); 
  //       flg = false;
  //     }
  //   }else{  
  //     flg=false;
  //   }
  //   return flg;
  // }
  
  test(value){
    this.toastr.info('機能作成中');
          // this.form.disable();
    console.log(this.form);
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

}
