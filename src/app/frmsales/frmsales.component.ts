import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild ,AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';
import { ToastrService } from 'ngx-toastr';
import { JmeitblComponent } from './jmeitbl.component';
import { JyumeiService } from './jyumei.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { BunshoService } from './../services/bunsho.service';
import { OkuriService } from './../services/okuri.service';
import { StaffService } from './../services/staff.service';
import { SoukoService } from './../services/souko.service';
import { McdService } from './../share/mcdhelp/mcd.service';
import { MembsService } from './../services/membs.service';
// import { GoodsService } from './../services/goods.service';
// import { GcdService } from './../share/gcdhelp/gcd.service';
import { DownloadService } from './../services/download.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { JdnohelpComponent } from './../share/jdnohelp/jdnohelp.component';
import { EdaService } from './../share/adreda/eda.service';
import { AdredaComponent } from './../share/adreda/adreda.component';

@Component({
  selector: 'app-frmsales',
  templateUrl: './frmsales.component.html',
  styleUrls: ['./../app.component.scss'],
  encapsulation : ViewEncapsulation.None,
  changeDetection:ChangeDetectionStrategy.OnPush
})
export class FrmsalesComponent implements OnInit, AfterViewInit {
  @ViewChild(JmeitblComponent ) jmeitbl:JmeitblComponent;
  form: FormGroup;
  // denno:number|string;
  mode: number=3;
  hktval: mwI.Sval[]=[];
  // mcdtxt:string;
  // scdtxt:string;
  // ncdtxt:string;  
  rows: FormArray = this.fb.array([]);
  qrurl:string;
  getden:number;
  gdsttl:number=0;
  stit:mwI.Stit[]=[];
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(public usrsrv: UserService,
              private fb: FormBuilder,
              private title: Title,
              private route: ActivatedRoute,
              private router:Router,
              private elementRef: ElementRef,
              private dialog: MatDialog,
              public mcdsrv: McdService,
              public edasrv: EdaService,
              public bunsrv: BunruiService,
              public bnssrv: BunshoService,
              public stfsrv: StaffService,
              public okrsrv: OkuriService,
              public memsrv: MembsService,
              public soksrv: SoukoService,
              // public gdssrv: GoodsService,
              // public gcdsrv: GcdService,
              public jmisrv:JyumeiService,
              private dwlsrv:DownloadService,
              private apollo: Apollo,
              private toastr: ToastrService,
              private overlay: Overlay,
              private cdRef:ChangeDetectorRef,
              private zone: NgZone) { 
    zone.onMicrotaskEmpty.subscribe(() => { 
      // console.log('frmsales detect change'); 
    });
    title.setTitle('受注伝票(MWSystem)');               
  }

  ngOnInit(): void {
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.form = this.fb.group({
      mcode: new FormControl(''),
      scode: new FormControl(''),
      ncode: new FormControl(''),
      nsaki: new FormControl(''),
      nadr: new FormControl(''),
      bunsho: new FormControl(''),
      day: new FormControl(''),
      yday: new FormControl(''),
      sday: new FormControl(''),
      uday: new FormControl(''),
      nday: new FormControl(''),
      hday: new FormControl(''),
      htime: new FormControl(''),
      hcode: new FormControl(''),
      okurisuu: new FormControl(''),
      okurino: new FormControl(''),
      souko: new FormControl(''),
      tcode: new FormControl(''),
      jcode: new FormControl('', Validators.required),
      pcode: new FormControl('', Validators.required),
      skbn: new FormControl('', Validators.required),
      dbikou: new FormControl(''),
      nbikou: new FormControl(''),
      obikou: new FormControl(''),
      inbikou: new FormControl(''),
      torikbn: new FormControl(''),
      cusden: new FormControl(''),
      daibiki: new FormControl(''),
      daibunrui: new FormControl(''),
      chubunrui: new FormControl(''),
      shobunrui: new FormControl(''),
      tcode1: new FormControl(''),
      gtotal: new FormControl(''),
      souryou: new FormControl(''),
      tesuu: new FormControl(''),
      nebiki: new FormControl(''),
      taxtotal: new FormControl(''),
      syoukei: new FormControl(''),
      total: new FormControl(''),
      jdstatus: new FormControl(''),
      jdshsta: new FormControl(''),
      mtbl: this.rows 
    });
    // this.memsrv.get_members().then(result => {
      // this.setMcdtxt();
      // this.setScdtxt();
      // this.setNcdtxt();
      // this.overlayRef.detach(); 
      // this.cdRef.detectChanges();     
    // });
    // this.gcdsrv.get_goods();
    this.bnssrv.get_bunsho();
    this.okrsrv.get_haisou();
    this.okrsrv.get_hokuri();
    this.okrsrv.get_hktime();
    this.soksrv.get_souko();
    this.bunsrv.get_bunrui();
    this.stfsrv.get_staff();
  }
  ngAfterViewInit():void{ //子コンポーネント読み込み後に走る
    this.memsrv.get_members().then(result => {
      this.route.paramMap.subscribe((params: ParamMap)=>{
        if (params.get('mode') === null){
          this.cancel();
        }else{
          this.mode = +params.get('mode');
          this.refresh();
        }
        if (params.get('denno') !== null){
          this.jmisrv.denno = +params.get('denno');
          // console.log(this.denno);
          this.get_jyuden(this.jmisrv.denno);
        }
      }); 
      this.jmisrv.observe.subscribe(flg=>{
        this.cdRef.detectChanges();
      });
    });
  }
  selected(value:number){
    const i:number = this.okrsrv.hokuri.findIndex(obj => obj.code == value);
    if(i > -1 ){
      this.hktval = [];
      for(let j=0;j<this.okrsrv.hktime.length;j++){
        if(this.okrsrv.hktime[j].hscode==this.okrsrv.hokuri[i].hscode){
          let sval:mwI.Sval ={value:this.okrsrv.hktime[j].code,viewval:this.okrsrv.hktime[j].name};
          this.hktval.push(sval);
        }
      } 
    } else {
      this.hktval = [];  
    }
  }

  selBetsu(value:string){
    if(value=="2"){
      // console.log(this.form.get('nadr'));
      this.form.get('nadr').setValue('');
    } else {
      this.form.get('nadr').setValue(+value); 
    }
  }

  download_csv(format:string){
    // console.log(this.form.getRawValue());
    
    
    let head = this.dwlsrv.pickObj(this.form.getRawValue(),['yday','mcode','ncode','nadr']);
    const det = this.dwlsrv.pickObjArr(this.form.getRawValue().mtbl,['line','gcode','gtext','suu','iriunit','mbikou','spec'])
    head['mcdtxt'] = this.memsrv.get_mcdtxt(this.form.value.mcode);
    head['adrname'] = this.edasrv.get_name(+this.form.getRawValue().nadr);
    head['tcdnm0'] = this.stfsrv.get_name(this.form.getRawValue().tcode);
    head['tcdnm1'] = this.stfsrv.get_name(this.form.getRawValue().tcode1);
    head['tcd0'] = this.form.getRawValue().tcode;
    // console.log(this.qrurl);
    this.dwlsrv.dl_csv(head,this.jmisrv.denno + format + "H.csv");
    this.dwlsrv.dl_kick(det,this.jmisrv.denno + format + "M.csv",this.usrsrv.system.urischema + format + "_" + this.jmisrv.denno,this.elementRef);
    
    const base64 = this.elementRef.nativeElement.querySelector('qr-code > img').src;
    this.dwlsrv.dl_img(this.jmisrv.denno + format + ".png",base64);
  }

  openOkuri(hcode,value){
    window.open(this.okrsrv.get_url(hcode) + value,'_blank');
  }

  test(value){
    this.toastr.info(this.form.value.yday);
    // this.usrsrv.getNumber('denno',2).subscribe(value => {
    //   console.log(value);
    // });
    console.log(this.usrsrv);
    // this.router.navigate(['/mstmember','3',value]);
    const url = this.router.createUrlTree(['/mstmember','3',value]);
    window.open(url.toString(),null,'top=100,left=100');
  }

  onEnter(){
      this.jmisrv.denno=this.usrsrv.convNumber(this.jmisrv.denno);
      this.get_jyuden(this.jmisrv.denno);
  }

  refresh():void {
    if(this.mode==3){
      this.form.disable();
      this.usrsrv.disable_mtbl(this.form);
    }else{
      this.form.enable();
      this.usrsrv.enable_mtbl(this.form);
    }
    
    // console.log(this.jmisrv.jyumei);
  }  

  get frmArr():FormArray {    
    return this.form.get('mtbl') as FormArray;
  }  

  get_jyuden(denno:number):void{
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    if(this.jmisrv.denno>0){
      this.apollo.watchQuery<any>({
        query: Query.GetJyuden, 
          variables: { 
            id : this.usrsrv.compid,
            dno: denno
          },
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.form.reset();
        if (data.trjyuden_by_pk == null){
          this.toastr.info("受注伝票番号" + denno + "は登録されていません");
          history.replaceState('','','./frmsales');
        } else {
          let jyuden:mwI.Jyuden=data.trjyuden_by_pk;
          if(jyuden.nadr>1){
            this.form.get('nsaki').setValue("2");
          } else { 
            this.form.get('nsaki').setValue(jyuden.nadr.toString());  
          }
          this.form.patchValue(jyuden);
          this.jmisrv.jyumei=data.trjyuden_by_pk.trjyumeis;
          this.jmeitbl.set_jyumei();
          this.usrsrv.setTmstmp(jyuden);
          this.jmisrv.denno=denno;
          this.qrurl="https://mwsys.herokuapp.com/frmkeep/" + this.jmisrv.denno;
          history.replaceState('','','./frmsales/' + this.mode + '/' + this.jmisrv.denno);
        }
        this.refresh();
        this.overlayRef.detach();
      },(error) => {
        console.log('error query GetJyuden', error);
        this.toastr.info("受注伝票読込エラー");
        this.form.reset();
        history.replaceState('','','./frmsales');
        this.overlayRef.detach();
      });
    }
    this.overlayRef.detach();
    this.cdRef.detectChanges();
  }
 
  mcdHelp(fldnm:string): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass= 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.form.get(fldnm).setValue(data.mcode);
          }
      }
    );
  }

  dennoHelp(){
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass= 'full-screen-modal';
    let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.jmisrv.denno = data.denno;
            this.get_jyuden(this.jmisrv.denno);
          }
      }
    );

  }
  changeMcd(){
    let lcmcode;
    if (this.form.value.mcode != null){
      lcmcode = this.usrsrv.convNumber(this.form.value.mcode);
    }else{
      lcmcode = ""; 
    }
    this.form.get('mcode').setValue(lcmcode);
    // this.setMcdtxt();
    this.form.get('scode').setValue(lcmcode);
    this.form.get('ncode').setValue(lcmcode);
    this.get_member(lcmcode);
    // this.form.get('nadr').setValue(0);
    // this.setScdtxt();
    // this.setNcdtxt();
  }
  // setMcdtxt(){
  //   let mcd:number=this.form.getRawValue().mcode;
  //   this.mcdtxt=this.memsrv.get_mcdtxt(mcd);
  //   if(this.mcdtxt ){
  //     this.get_member(mcd);
  //   }
  // }  
  // setScdtxt(){
  //   let scd:number=this.form.getRawValue().scode;
  //   this.scdtxt=this.memsrv.get_mcdtxt(scd);
  // } 

  // setNcdtxt(){
  //   let ncd:number=this.form.getRawValue().ncode;
  //   this.ncdtxt=this.memsrv.get_mcdtxt(ncd);
  // }
  get_member(mcode:number){
    this.apollo.watchQuery<any>({
      query: Query.GetMember, 
        variables: { 
          id : this.usrsrv.compid,
          mcode: mcode
        },
    })
    .valueChanges
    .subscribe(({ data }) => {
      if (data.msmember_by_pk == null){
        this.toastr.info("顧客コード" + mcode + "は登録されていません");
      } else {
        let member:mwI.Member=data.msmember_by_pk;
        this.form.patchValue(member);
        this.form.get('dbikou').setValue(member.msmadrs[0].adrinbikou);
        this.form.get('inbikou').setValue(member.msmadrs[0].adrinbikou);
        this.form.get('obikou').setValue(member.msmadrs[0].adrokrbko);
        this.jmisrv.mtax=member.mtax;
        this.jmisrv.tankakbn=member.tankakbn;
        this.jmisrv.sptnkbn=member.sptnkbn;
        this.jmisrv.ntype=member.ntype;
        this.jmisrv.tntype=member.tntype;
        this.stit=member.msmstits;
        this.cdRef.detectChanges();
      }
    },(error) => {
      console.log('error query get_member', error);
    });
  }

  get_madr(mcode:number){
    this.apollo.watchQuery<any>({
      query: Query.GetMadr, 
        variables: { 
          id : this.usrsrv.compid,
          mcode: mcode
        },
    })
    .valueChanges
    .subscribe(({ data }) => {
      if (data.msmadr.length == 0){

      } else {
        let msmadrs:mwI.Adrs[]=data.msmadr;
        this.edasrv.mcode = mcode ;
        this.edasrv.edas=[];
        this.edasrv.adrs=[];
        for (let j=0;j<msmadrs.length;j++){
          if (msmadrs[j].eda > 1){
            this.edasrv.adrs.push(msmadrs[j]);
            this.edasrv.edas.push({
              eda:msmadrs[j].eda,
              zip:msmadrs[j].zip,
              region:msmadrs[j].region,
              local:msmadrs[j].local,
              street:msmadrs[j].street,
              extend:msmadrs[j].extend,
              extend2:msmadrs[j].extend2,
              adrname:msmadrs[j].adrname,
              tel:this.mcdsrv.set_tel(msmadrs[j].tel,msmadrs[j].tel2,msmadrs[j].tel3,msmadrs[j].fax)
            });
          }
        }
      }
    },(error) => {
      console.log('error query get_msmadr', error);
    });
  }

  diaBetsu():void {
    let ncd:number=this.form.value.ncode;
    if( this.checkMcode(ncd) ){
      let dialogConfig = new MatDialogConfig();
      dialogConfig.autoFocus = true;
      dialogConfig.data = {
        mcode: ncd,
        mode: this.mode,
        eda: this.form.value.nadr
      };
      let dialogRef = this.dialog.open(AdredaComponent, dialogConfig);
      dialogRef.afterClosed().subscribe(
        data=>{
            console.log(data);
            if(typeof data != 'undefined'){
              this.form.get('nadr').setValue(data);
            }
        }
      );
    }
  }

  checkMcode(mcode:number|string):boolean {
    let flg:boolean; 
    let i:number = this.memsrv.membs.findIndex(obj => obj.mcode == mcode);
    if( i > -1 ){
      flg = true;
    } else {
      // if( mcode.toString().indexOf('未登録') == -1 && mcode.toString().indexOf('読込') == -1 && mcode !== '' ){
      //   this.mcd = mcode + '　未登録';
      // }
      flg = false;       
    }
    return flg;
  }

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.jmisrv.denno=0; 
    this.form.get('tcode').setValue(this.usrsrv.staff.code);
    this.form.get('day').setValue(new Date());
    this.form.get('souko').setValue("01");
    this.jmisrv.souko="01";
    this.form.get('skbn').setValue("1");
    this.jmeitbl.frmArr.clear(); 
    this.refresh(); 
    this.jmeitbl.add_rows(20);
  }

  modeToUpd():void {
    this.mode=2;
    this.refresh(); 
    history.replaceState('','','./frmsales/' + this.mode + '/' + this.jmisrv.denno);
  }

  cancel():void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode=3;
      this.get_jyuden(this.jmisrv.denno);
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('','','./frmsales/' + this.mode + '/' + this.jmisrv.denno);
    }
  }
  getInvalid():string{
    let tooltip:string="";
    const ctrls0=this.form.controls;
  　for (const name in ctrls0){
      if(ctrls0[name].invalid){
        if(name=='mtbl'){
          const ctrls=(this.frmArr.at(0) as FormGroup).controls
          for (const nam in ctrls){
            if(ctrls[nam].invalid){
              tooltip += this.usrsrv.getColtxt('trjyumei',nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n' ;
            }
          }
      
        }else{
          // console.log(name);  
          tooltip += this.usrsrv.getColtxt('trjyuden',name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n' ;
        }
      }
    }
    return tooltip;
  }

  save():void {

    





    
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
