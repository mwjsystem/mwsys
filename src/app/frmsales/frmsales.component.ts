import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild ,AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';
import * as Querym from './../mstmember/queries.mstm';
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
import { GoodsService } from './../services/goods.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { EdaService } from './../share/adreda/eda.service';
import { AdredaComponent } from './../share/adreda/adreda.component';

@Component({
  selector: 'app-frmsales',
  templateUrl: './frmsales.component.html',
  styleUrls: ['./../app.component.scss'],
  encapsulation : ViewEncapsulation.None,
  changeDetection:ChangeDetectionStrategy.OnPush
})
export class FrmsalesComponent implements OnInit {
  @ViewChild(JmeitblComponent ) jmeitbl:JmeitblComponent;
  form: FormGroup;
  denno:number|string;
  mode: number=3;
  hktval: mwI.Sval[]=[];
  mcdtxt:string;
  scdtxt:string;
  ncdtxt:string;
  rows: FormArray = this.fb.array([]);
  gdsttl:number=0;
  constructor(public usrsrv: UserService,
              private fb: FormBuilder,
              private title: Title,
              private route: ActivatedRoute,
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
              public gdssrv: GoodsService,
              public jmisrv:JyumeiService,
              private apollo: Apollo,
              private toastr: ToastrService,
              private cdRef:ChangeDetectorRef,
              private zone: NgZone) { 
    zone.onMicrotaskEmpty.subscribe(() => { console.log('frmsales detect change'); });
    title.setTitle('受注伝票(MwjSystem)');               
  }

  ngOnInit(): void {
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
      gtotal: new FormControl(''),
      souryou: new FormControl(''),
      tesuu: new FormControl(''),
      nebiki: new FormControl(''),
      taxtotal: new FormControl(''),
      syoukei: new FormControl(''),
      tyousei: new FormControl(''),
      total: new FormControl(''),
      mtbl: this.rows 
    });
    
    this.memsrv.get_members();
    this.bnssrv.get_bunsho();
    this.okrsrv.get_haisou();
    this.okrsrv.get_hokuri();
    this.okrsrv.get_hktime();
    this.soksrv.get_souko();
    this.bunsrv.get_bunrui();
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('denno') !== null){
        this.denno = +params.get('denno');
        this.get_jyuden(this.denno);
      }
      if (params.get('mode') === null){
        this.mode = 3;
      }else{
        this.mode = +params.get('mode');
      } 
    }); 
  }
  ngAfterViewInit(): void{
    setTimeout(() => {
      this.refresh();
    });
  }

  ngAfterViewChecked(): void {
    this.cdRef.detectChanges();
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

  test(value){
    this.toastr.info(this.form.value.yday);
  }

  refresh():void {
    if (this.denno > 0){
      this.get_jyuden(this.denno);
    }
    // console.log(this.jmisrv.jyumei);
  }  
  
  get frmArr():FormArray {    
    return this.form.get('mtbl') as FormArray;
  }  

  disable_Jmeitbl() {
    (<FormArray>this.form.get('mtbl'))
      .controls
      .forEach(control => {
        control.disable();
      })

  }

  enable_Jmeitbl() {
    (<FormArray>this.form.get('mtbl'))
      .controls
      .forEach(control => {
        control.enable();
      })
  }

  get_jyuden(denno:number|string):void{
    this.denno += '　読込中';
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
        this.denno = denno + '　未登録';
        history.replaceState('','','./frmsales');
      } else {
        let jyuden:mwI.Jyuden=data.trjyuden_by_pk;
        // console.log(this.form.value);
        if(jyuden.nadr>1){
          this.form.get('nsaki').setValue("2");
        } else { 
          this.form.get('nsaki').setValue(jyuden.nadr.toString());  
        }
        // console.log(this.form);
        this.form.patchValue(jyuden);
        // this.form.get('nadr').setValue(+jyuden.nadr);
        // console.log(this.form.value.bunsyo,jyuden.bunsyo);
        this.jmisrv.jyumei=data.trjyuden_by_pk.trjyumeis;
        // console.log(this.jmisrv.jyumei,data.trjyuden_by_pk);
        // this.jmisrv.subject.next();
        this.jmeitbl.set_jyumei();
        this.usrsrv.setTmstmp(jyuden);
        this.denno=denno;
        this.setMcdtxt();
        this.setScdtxt();
        this.setNcdtxt();
        this.gdssrv.get_Goods(this.usrsrv.formatDate(this.form.value.day));

        if(this.mode==3){
          this.form.disable();
          // console.log('refresh disable');
          this.disable_Jmeitbl();
        }else{
          this.form.enable();
          // console.log('refresh enable');
          this.enable_Jmeitbl();
        }
        history.replaceState('','','./frmsales/' + this.mode + '/' + this.denno);
      }
    },(error) => {
      console.log('error query GetJyuden', error);
      this.denno = denno + '　未登録';
      this.form.reset();
      history.replaceState('','','./frmsales');
    });
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

  }
  changeMcd(){
    let mcd:number=this.form.value.mcode;
    this.setMcdtxt();
    this.form.get('scode').setValue(mcd);
    this.form.get('ncode').setValue(mcd);
    // this.form.get('nadr').setValue(0);
    this.setScdtxt();
    this.setNcdtxt();
  }
  setMcdtxt(){
    let mcd:number=this.form.getRawValue().mcode;
    // console.log(this.form.getRawValue().mcode,this.membs);
    const i:number = this.memsrv.membs.findIndex(obj => obj.mcode == mcd);
    // console.log(i);
    if(i > -1 ){
      this.mcdtxt = this.memsrv.membs[i].mei ?? "";
      this.mcdtxt = this.memsrv.membs[i].sei + this.mcdtxt;
    } else {
      this.mcdtxt="";  
    }
  }  
  setScdtxt(){
    let scd:number=this.form.getRawValue().scode;
    const i:number = this.memsrv.membs.findIndex(obj => obj.mcode == scd);
    if(i > -1 ){
      // this.scdtxt = this.membs[i].mei ?? "";
      this.scdtxt = this.memsrv.membs[i].sei + (this.memsrv.membs[i].mei ?? "");
    } else {
      this.scdtxt="";  
    }
  } 

  setNcdtxt(){
    // this.form.get('nadr').setValue(0);
    let ncd:number=this.form.getRawValue().ncode;
    const i:number = this.memsrv.membs.findIndex(obj => obj.mcode == ncd);
    // console.log(i);
    if(i > -1 ){
      this.ncdtxt = this.memsrv.membs[i].mei ?? "";
      this.ncdtxt = this.memsrv.membs[i].sei + this.ncdtxt;
      this.get_member(ncd);
    } else {
      this.ncdtxt="";  
    }
  }

  get_member(mcode:number){
    this.apollo.watchQuery<any>({
      query: Querym.GetMast1, 
        variables: { 
          id : this.usrsrv.compid,
          mcode: mcode
        },
    })
    .valueChanges
    .subscribe(({ data }) => {
      if (data.msmember_by_pk == null){

      } else {
        let member:mwI.Member=data.msmember_by_pk;
        this.edasrv.mcode = mcode ;
        this.edasrv.edas=[];
        this.edasrv.adrs=[];
        for (let j=0;j<member.msmadrs.length;j++){
          if (member.msmadrs[j].eda > 1){
            this.edasrv.adrs.push(member.msmadrs[j]);
            this.edasrv.edas.push({
              eda:member.msmadrs[j].eda,
              zip:member.msmadrs[j].zip,
              region:member.msmadrs[j].region,
              local:member.msmadrs[j].local,
              street:member.msmadrs[j].street,
              extend:member.msmadrs[j].extend,
              extend2:member.msmadrs[j].extend2,
              adrname:member.msmadrs[j].adrname,
              tel:this.mcdsrv.set_tel(member.msmadrs[j].tel,member.msmadrs[j].tel2,member.msmadrs[j].tel3,member.msmadrs[j].fax)
            });
          }
        }
      }
    },(error) => {
      console.log('error query get_msmember', error);
    });
  }

  diaBetsu():void {
    let ncd:number=this.form.value.ncode;
    if( this.checkMcode(ncd) ){
      let dialogConfig = new MatDialogConfig();
      dialogConfig.autoFocus = true;
      dialogConfig.data = {
        mcode: ncd +'(' + this.ncdtxt + ')',
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
      this.form.reset();
      history.replaceState('','','./frmsales'); 
      flg = false;       
    }
    return flg;
  }

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.refresh();
    this.denno="新規登録"; 
    this.form.get('day').setValue(new Date());
    this.gdssrv.get_Goods(this.usrsrv.formatDate(this.form.value.day));
  }

  modeToUpd():void {
    this.mode=2;
    this.refresh();
    history.replaceState('','','./frmsales/' + this.mode + '/' + this.denno);
  }

  cancel():void {
    this.mode=3;
    this.refresh();
    this.form.markAsPristine();
    history.replaceState('','','./frmsales/' + this.mode + '/' + this.denno);
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
