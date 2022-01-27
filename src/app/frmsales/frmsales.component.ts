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
import { StoreService } from './../services/store.service';
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
  nskVal:mwI.Sval[]=[];
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
              public strsrv: StoreService,
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
      jdstatus: new FormControl(''),
      jdshsta: new FormControl(''),
      torikbn: new FormControl(''),
      mcode: new FormControl(''),
      scde: new FormControl(''),
      ncode: new FormControl(''),
      nsaki: new FormControl(''),
      nadr: new FormControl(''),
      bunsho: new FormControl(''),
      day: new FormControl(''),
      yday: new FormControl(''),
      sday: new FormControl(''),
      uday: new FormControl(''),
      nday: new FormControl(''),
      tcode: new FormControl(''),
      scode: new FormControl(''),
      skbn: new FormControl('', Validators.required),
      jcode: new FormControl('', Validators.required),
      pcode: new FormControl('', Validators.required),
      hcode: new FormControl(''),
      hday: new FormControl(''),
      htime: new FormControl(''),
      okurisuu: new FormControl(''),
      okurino: new FormControl(''),      
      bikou: new FormControl(''),
      nbikou: new FormControl(''),
      sbikou: new FormControl(''),
      obikou: new FormControl(''),
      cusden: new FormControl(''),
      ryoate: new FormControl(''),
      daibiki: new FormControl(''),
      daibunrui: new FormControl(''),
      chubunrui: new FormControl(''),
      shobunrui: new FormControl(''),
      tcode1: new FormControl(''),
      gtotalzn: new FormControl(''),
      souryouzn: new FormControl(''),
      tesuuzn: new FormControl(''),
      nebikizn: new FormControl(''),
      taxtotal: new FormControl(''),
      total: new FormControl(''),
      genka: new FormControl(''),
      hgenka: new FormControl(''),
      egenka: new FormControl(''),
      mtbl: this.rows 
    });
    this.bnssrv.get_bunsho();
    this.okrsrv.get_haisou();
    this.okrsrv.get_hokuri();
    this.okrsrv.get_hktime();
    this.strsrv.get_store();
    this.bunsrv.get_bunrui();
    // this.stfsrv.get_staff();
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
      this.form.get('nadr').enable();
      this.form.get('bunsho').setValue(this.jmisrv.tntype);
    } else {
      this.form.get('nadr').setValue(+value);
      this.form.get('nadr').disable(); 
      this.form.get('bunsho').setValue(this.jmisrv.ntype);
      this.changeEda(+value);
    }
  }

  download_csv(format:string){
    // console.log(this.form.getRawValue());
    
    
    let head = this.dwlsrv.pickObj(this.form.getRawValue(),['yday','mcode','ncode','nadr']);
    const det = this.dwlsrv.pickObjArr(this.form.getRawValue().mtbl,['line','gcode','gtext','suu','unit','mbikou','spec'])
    head['mcdtxt'] = this.memsrv.get_mcdtxt(this.form.value.mcode);
    head['adrname'] = this.edasrv.get_name(+this.form.getRawValue().nadr);
    head['tcdnm0'] = this.stfsrv.get_name(this.form.getRawValue().tcode);
    head['tcdnm1'] = this.stfsrv.get_name(this.form.getRawValue().tcode1);
    head['tcd0'] = this.form.getRawValue().tcode;
    // console.log(this.qrurl);
    this.dwlsrv.dl_csv(head,this.jmisrv.denno + format + "H.csv");
    this.dwlsrv.dl_csv(det,this.jmisrv.denno + format + "M.csv");
    
    const base64 = this.elementRef.nativeElement.querySelector('qr-code > img').src;
    this.dwlsrv.dl_img(this.jmisrv.denno + format + ".png",base64);
    
    this.dwlsrv.dl_kick(this.usrsrv.system.urischema + format + "_" + this.jmisrv.denno,this.elementRef);
  }

  openOkuri(hcode,value){
    window.open(this.okrsrv.get_url(hcode) + value,'_blank');
  }

  test(value){
    this.toastr.info(this.form.value.yday);
    console.log(this.getInvalid());
    // // this.router.navigate(['/mstmember','3',value]);
    // const url = this.router.createUrlTree(['/mstmember','3',value]);
    // window.open(url.toString(),null,'top=100,left=100');
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
  }  

  get frmArr():FormArray {    
    return this.form.get('mtbl') as FormArray;
  }  

  get_jyuden(denno:number):void{
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    if(this.jmisrv.denno>0){
      this.jmisrv.qry_jyuden(denno).subscribe(
        result => {
          this.form.reset();
          this.jmisrv.jyumei=[];
          if (result == null){
            this.toastr.info("受注伝票番号" + denno + "は登録されていません");
            history.replaceState('','','./frmsales');
          } else {
            let jyuden:mwI.Trjyuden=result;
            // console.log(jyuden);
            if(jyuden.nadr>1){
              this.form.get('nsaki').setValue("2");
            } else { 
              this.form.get('nsaki').setValue(jyuden.nadr.toString());  
            }
            this.form.patchValue(jyuden);
            this.jmisrv.edit_jyumei(jyuden.trjyumeis);
            this.jmeitbl.set_jyumei(jyuden.skbn);
            this.usrsrv.setTmstmp(jyuden);
            this.jmisrv.denno=denno;
            this.get_member(jyuden.mcode,false);
            this.qrurl="https://mwsys.herokuapp.com/frmkeep/" + this.jmisrv.denno;
            history.replaceState('','','./frmsales/' + this.mode + '/' + this.jmisrv.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        },error => {
          console.log('error query GetJyuden', error);
          this.toastr.info("受注伝票読込エラー");
          this.form.reset();
          history.replaceState('','','./frmsales');
          this.overlayRef.detach();
        }
      );
    } else {
      this.form.reset();
      this.jmeitbl.frmArr.clear();
      this.jmeitbl.add_rows(1);
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
    let lcmcode:string="";
    if (this.form.value.mcode != null){
      lcmcode = this.usrsrv.convUpper(this.form.value.mcode);
    }else{
      lcmcode = ""; 
    }
    this.form.get('mcode').setValue(lcmcode);
    this.form.get('scde').setValue(lcmcode);
    this.form.get('ncode').setValue(lcmcode);
    this.get_member(lcmcode,true);
  }

  changeEda(eda:number){
    if (eda!==null){
      let i:number = this.edasrv.adrs.findIndex(obj => obj.eda == eda);
      // console.log(eda,this.edasrv.adrs);
      if( i > -1 ){
        const adr = this.edasrv.adrs[i];
        this.form.get('nbikou').setValue(adr.nbikou);
        this.form.get('sbikou').setValue(adr.sbikou);
        this.form.get('obikou').setValue(adr.obikou);
        this.jmisrv.address = adr.zip + '\n' + adr.region + adr.local + '\n' +  adr.street + '\n' + (adr.extend ?? '') + (adr.extend2 ?? '') + '\n' + adr.adrname + '\n' + adr.tel;
      } else {
        this.toastr.info("別納品先枝番" + eda + "は登録されていません");      
      }  
    }
  }

  async setOkrno(){
    let okrno:string = await this.okrsrv.set_okurino(this.form.value.hcode);
    // console.log(okrno);
    if(this.usrsrv.compid == 1 && this.form.value.mcode==408223){
      okrno = await this.jmisrv.check_amazon(this.form.value.hcode,okrno);
    }
    this.form.get('okurino').setValue(okrno);
  }

  get_member(mcode:string,flg:boolean){
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
        if(flg){
          this.form.patchValue(member);
          this.form.get('nsaki').setValue(member.gadr);
        }
        this.jmisrv.mtax=member.mtax;
        this.jmisrv.tankakbn=member.tankakbn;
        this.jmisrv.sptnkbn=member.sptnkbn;
        this.jmisrv.ntype=member.ntype;
        this.jmisrv.tntype=member.tntype;
        this.stit=member.msmstits;
        let msmadrs:mwI.Adrs[]=member.msmadrs;
        this.edasrv.mcode = mcode ;
        this.edasrv.edas=[];
        this.edasrv.adrs=[];
        this.nskVal=[];
        this.nskVal.push({value:"0",viewval:"基本住所"});
        for (let j=0;j<msmadrs.length;j++){          
          this.edasrv.adrs.push(msmadrs[j]);
          if(msmadrs[j].eda==1){
            this.nskVal.push({value:"1",viewval:"その他住所"});
          }
          if (msmadrs[j].eda > 1){
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
        this.nskVal.push({value:"2",viewval:"別納"});
        this.changeEda(this.form.value.nadr);
        this.cdRef.detectChanges();
      }
    },(error) => {
      console.log('error query get_member', error);
    });
  }

  canEnter(e:KeyboardEvent):void{
    let element = e.target as HTMLElement;
    // console.log(element,element.tagName);
    if(element.tagName !=='TEXTAREA'){
      e.preventDefault();
    }
  }

  diaBetsu():void {
    let ncd:string=this.form.value.ncode;
    if( this.checkMcode(ncd) ){
      let dialogConfig = new MatDialogConfig();
      dialogConfig.autoFocus = true;
      dialogConfig.data = {
        mcode: ncd + ' ' + this.memsrv.get_mcdtxt(ncd),
        mode: this.mode,
        eda: this.form.value.nadr,
        flg: true
      };
      // console.log(dialogConfig.data);
      let dialogRef = this.dialog.open(AdredaComponent, dialogConfig);
      dialogRef.afterClosed().subscribe(
        data=>{
            // console.log(data);
            if(typeof data != 'undefined' && this.mode!=3){
              this.form.get('nadr').setValue(data);
              this.changeEda(data);
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
    this.form.get('scode').setValue(this.usrsrv.staff.scode);
    this.form.get('skbn').setValue("0");
    this.jmeitbl.frmArr.clear(); 
    this.refresh(); 
    this.jmeitbl.add_rows(1);
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
      if (name == 'yday'){
        // console.log(ctrls0[name].errors);
        if(ctrls0[name].errors?.matDatepickerFilter){
          ctrls0[name].setErrors(null);
        }
      }
      if(ctrls0[name].invalid){
        if(name=='mtbl'){
          for(let i=0;i<this.frmArr.length;i++){ 
            const ctrls=(this.frmArr.at(i) as FormGroup).controls;
            for (const nam in ctrls){
              if(ctrls[nam].invalid){
                tooltip += this.usrsrv.getColtxt('trjyumei',nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n' ;
              }
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

  async save() {
    // console.log(this.form.get('nadr'));
    let jyuden:any={
      torikbn: Boolean(this.usrsrv.editFrmval(this.form,'torikbn')),
      updated_at:new Date(),
      updated_by:this.usrsrv.staff.code,
      mcode: this.usrsrv.editFrmval(this.form,'mcode'),
      scde: this.usrsrv.editFrmval(this.form,'scde'),
      ncode: this.usrsrv.editFrmval(this.form,'ncode'),
      nadr: +this.form.getRawValue()['nadr'],
      bunsho: this.usrsrv.editFrmval(this.form,'bunsho'),
      day: this.usrsrv.editFrmval(this.form,'day'),
      yday: this.usrsrv.editFrmval(this.form,'yday'),
      sday: this.usrsrv.editFrmval(this.form,'sday'),
      uday: this.usrsrv.editFrmval(this.form,'uday'),
      nday: this.usrsrv.editFrmval(this.form,'nday'),
      tcode: this.usrsrv.editFrmval(this.form,'tcode'),
      scode: this.usrsrv.editFrmval(this.form,'scode'),
      skbn: this.usrsrv.editFrmval(this.form,'skbn'),
      jcode: this.usrsrv.editFrmval(this.form,'jcode'),
      pcode: this.usrsrv.editFrmval(this.form,'pcode'),
      hcode: this.usrsrv.editFrmval(this.form,'hcode'),
      hday: this.usrsrv.editFrmval(this.form,'hday'),
      htime: this.usrsrv.editFrmval(this.form,'htime'),
      okurisuu: this.usrsrv.editFrmval(this.form,'okurisuu'),
      okurino: this.usrsrv.editFrmval(this.form,'okurino'),
      bikou: this.usrsrv.editFrmval(this.form,'bikou'),
      nbikou: this.usrsrv.editFrmval(this.form,'nbikou'),
      obikou: this.usrsrv.editFrmval(this.form,'obikou'),
      sbikou: this.usrsrv.editFrmval(this.form,'sbikou'),
      cusden: this.usrsrv.editFrmval(this.form,'cusden'),
      ryoate: this.usrsrv.editFrmval(this.form,'ryoate'),
      daibiki: this.usrsrv.editFrmval(this.form,'daibiki'),
      daibunrui: this.usrsrv.editFrmval(this.form,'daibunrui'),
      chubunrui: this.usrsrv.editFrmval(this.form,'chubunrui'),
      shobunrui: this.usrsrv.editFrmval(this.form,'shobunrui'),
      tcode1: this.usrsrv.editFrmval(this.form,'tcode1'),
      gtotalzn: this.usrsrv.editFrmval(this.form,'gtotalzn'),
      souryouzn: this.usrsrv.editFrmval(this.form,'souryouzn'),
      tesuuzn: this.usrsrv.editFrmval(this.form,'tesuuzn'),
      nebikizn: this.usrsrv.editFrmval(this.form,'nebikizn'),
      taxtotal: this.usrsrv.editFrmval(this.form,'taxtotal'),
      total: this.usrsrv.editFrmval(this.form,'total'),
      genka: this.usrsrv.editFrmval(this.form,'genka'),
      hgenka: this.usrsrv.editFrmval(this.form,'hgenka'),
      egenka: this.usrsrv.editFrmval(this.form,'egenka'),
    }

    if(this.mode==2){ 
      let jyumei=this.jmeitbl.get_jyumei(this.jmisrv.denno);  
      console.log(jyuden,jyumei);   
      this.jmisrv.upd_jyuden(this.jmisrv.denno,{...jyuden,jdstatus:this.jmisrv.get_jdsta(jyumei)},jyumei)
      .then(result => {
        this.toastr.success('受注伝票' + this.jmisrv.denno + 'の変更を保存しました');
        //  zaiko更新処理 (読込時分マイナス)
        this.jmisrv.trzaiko.forEach(e=>{
          this.jmisrv.upd_zaiko(e);
        });
        //  zaiko更新処理 (通常分プラス)
        jyumei.forEach(e=>{
          console.log(e,this.form);
          if (jyuden.skbn != "1"){
            if(e.gskbn == "0" && e.sday != null){
              const lczaiko:mwI.Zaiko={
                scode:e.scode,
                gcode:e.gcode,
                day:e.sday,
                suu:e.suu
              }
              this.jmisrv.upd_zaiko(lczaiko);
            } else if(e.gskbn == "1" && e.sday != null) {
              e.msgzais.forEach(zai => {
                const lczai:mwI.Zaiko={
                  scode:e.scode,
                  gcode:zai.zcode,
                  day:e.sday,
                  suu:e.suu * zai.irisu
                }
                this.jmisrv.upd_zaiko(lczai);
              });
            }  
          }
        });
        this.form.markAsPristine();
        this.cancel();
       }).catch(error => {
        this.toastr.error('データベースエラー','受注伝票' + this.jmisrv.denno + 'の変更保存ができませんでした',
                          {closeButton: true,disableTimeOut: true,tapToDismiss: false});
        console.log('error update_jyuen', error);
      });
    }else{//新規登録
      this.jmisrv.denno = await this.jmisrv.get_denno();
      const jyumei=this.jmeitbl.get_jyumei(this.jmisrv.denno);
      const trjyuden:mwI.Trjyuden[] = [{
        ...{ id: this.usrsrv.compid,
             denno: this.jmisrv.denno,
             created_at:new Date(),
             created_by:this.usrsrv.staff.code,
             jdstatus:this.jmisrv.get_jdsta(jyumei)}
        ,...jyuden,
      }]
      console.log(trjyuden,jyumei);
      this.jmisrv.ins_jyuden(trjyuden,jyumei)
      .then(result => {
        console.log('insert_trjyu',result);
        this.toastr.success('受注伝票' + this.jmisrv.denno + 'を新規登録しました');
        //  zaiko更新処理 　新規
        jyumei.forEach(e=>{
          console.log(e,this.form);
          if (jyuden.skbn != "1"){
            if(e.gskbn == "0" && e.sday != null){
              const lczaiko:mwI.Zaiko={
                scode:e.scode,
                gcode:e.gcode,
                day:e.sday,
                suu:e.suu
              }
              this.jmisrv.upd_zaiko(lczaiko);
            } else if(e.gskbn == "1" && e.sday != null) {
              e.msgzais.forEach(zai => {
                const lczai:mwI.Zaiko={
                  scode:e.scode,
                  gcode:zai.zcode,
                  day:e.sday,
                  suu:e.suu * zai.irisu
                }
                this.jmisrv.upd_zaiko(lczai);
              });
            }  
          }
        });
        this.form.markAsPristine();
        this.cancel();
       }).catch(error => {
        this.toastr.error('データベースエラー','受注伝票の新規登録ができませんでした',
                          {closeButton: true,disableTimeOut: true,tapToDismiss: false});
        console.log('error insert_jyuden', error);
      });
    } 
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
