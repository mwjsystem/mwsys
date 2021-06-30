import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { HmeitblComponent } from './hmeitbl.component';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { SoukoService } from './../services/souko.service';
import { HatmeiService } from './hatmei.service';
import { DownloadService } from './../services/download.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-frmsupply',
  templateUrl: './frmsupply.component.html',
  styleUrls: ['./../app.component.scss']
})
export class FrmsupplyComponent implements OnInit, AfterViewInit {
  @ViewChild(HmeitblComponent) hmeitbl:HmeitblComponent;
  form: FormGroup;
  denno:number=0;
  mode: number=3;
  vcdtxt:string;
  rows: FormArray = this.fb.array([]);
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
              private dwlsrv:DownloadService,
              public bunsrv: BunruiService,
              public soksrv: SoukoService,
              public stfsrv: StaffService,
              public hmisrv: HatmeiService,
              private apollo: Apollo,
              private toastr: ToastrService,
              private overlay: Overlay,
              private cdRef:ChangeDetectorRef) {
      title.setTitle('発注伝票(MWSystem)');  
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      vcode: new FormControl(''),
      day: new FormControl(''),
      soko: new FormControl(''),
      tcode: new FormControl(''),
      dbiko: new FormControl(''),
      inbiko: new FormControl(''),
      gtotal: new FormControl(''),
      ttotal: new FormControl(''),
      tax: new FormControl(''),
      total: new FormControl(''),
      jdenno: new FormControl(''),
      mtbl: this.rows 
    });
    this.soksrv.get_souko();
    this.bunsrv.get_bunrui();
    this.stfsrv.get_staff();
  }

  ngAfterViewInit():void{
    // console.log(this.usrsrv);
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('mode') === null){
        this.cancel();
      }else if(+params.get('mode')==1){
        this.modeToCre();
        // console.log(params);
        // JSON.parse(localstrage.getItem()); 
        this.route.queryParamMap.pipe(
          filter(n=>Object.keys(n["params"]).length!==0)
          ).subscribe(
            n=>{
              let params = n["params"];
              Object.keys(params).map(k=>{
                if (k=="stkey"){
                  const stra = JSON.parse(localStorage.getItem(params[k])); 
                  this.form.patchValue({vcode:stra.vcd});
                  this.hmeitbl.insRows(stra.mei);
                  // console.log(stra.hdno,this.denno);
                  // localStorage.removeItem(params[k]);
                }
              })
            }
          ) 
          this.denno = +params.get('denno');
          this.form.get('tcode').setValue(this.usrsrv.staff?.code);
      }else{
        this.mode = +params.get('mode');
        if(this.mode==3){
          this.form.disable();
          this.usrsrv.disable_mtbl(this.form);
        }else{
          this.form.enable();
          this.usrsrv.enable_mtbl(this.form);
        }
        if (params.get('denno') !== null){
          this.denno = +params.get('denno');
          // console.log(this.denno);
          this.get_hatden(this.denno);
        }
      } 
    }); 
    this.hmisrv.observe.subscribe(flg=>{
      this.cdRef.detectChanges();
    });
  }

  get_hatden(denno:number):void{    
    if (!this.overlayRef) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    const GetTran = gql`
    query get_hatden($dno: Int!, $id: smallint!) {
      trhatden_by_pk(denno: $dno, id: $id) {
        vcode
        day
        soko
        tcode
        gtotal
        ttotal
        jdenno
        total
        dbiko
        inbiko
        created_at
        created_by
        tax
        updated_at
        updated_by
        trhatmeis {
          day
          gcode
          gtext
          inday
          iriunit
          jdenno
          jline
          line
          mbiko
          money
          spec
          tanka
          suu
          taxrate
          yday
          ydaykbn
        }
      }
    }`;
    if(denno>0){
      this.apollo.watchQuery<any>({
        query: GetTran, 
          variables: { 
            id : this.usrsrv.compid,
            dno: denno
          },
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.form.reset();
        if (data.trhatden_by_pk == null){
          // this.denno = denno + '　未登録';
          this.toastr.warning("発注伝票番号" + denno + "は登録されていません");
          history.replaceState('','','./frmsupply');
        } else {
          let hatden:mwI.Hatden=data.trhatden_by_pk;
          this.form.patchValue(hatden);
          this.usrsrv.setTmstmp(hatden);
          this.hmisrv.hatmei=data.trhatden_by_pk.trhatmeis;
          this.hmeitbl.set_hatmei();
          this.setVcdtxt();
          this.denno=denno;
          history.replaceState('','','./frmsupply/' + this.mode + '/' + this.denno);
        }
        this.overlayRef.detach();
      },(error) => {
        console.log('error query GetHatden', error);
        // this.denno = denno + '　読込エラー';
        this.toastr.info("発注伝票番号" + denno + "は登録されていません");
        this.form.reset();
        history.replaceState('','','./frmsupply');
        this.overlayRef.detach();
      });
    }
    if(this.mode==3){
      this.form.disable();
      // console.log('refresh disable');
      this.usrsrv.disable_mtbl(this.form);
    }else{
      this.form.enable();
      // console.log('refresh enable');
      this.usrsrv.enable_mtbl(this.form);
    }
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

  download_csv(format:string){
    
  }

  get frmArr():FormArray {    
    return this.form.get('mtbl') as FormArray;
  }  

  vcdHelp(fldnm:string): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.form.get(fldnm).setValue(data.code);
            this.vcdtxt = data.adrname;
          }
      }
    );
  }

  refresh():void {
    if (this.denno !=null ){
      this.denno=this.usrsrv.convNumber(this.denno);
      this.get_hatden(this.denno);
    }
    
    // console.log(this.jmisrv.jyumei);
  }  

  dennoHelp(){

  }

  setVcdtxt(){
    const GetMast = gql`
    query get_vendor($id:smallint!,$vcd:String!) {
      msvendor_by_pk(id: $id,code: $vcd) {
        adrname
      }
    }`;
    if(this.form.get('vcode').value){
      this.apollo.watchQuery<any>({
            query: GetMast, 
            variables: { 
              id : this.usrsrv.compid,
              vcd: this.form.get('vcode').value
            },
        })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(this.form.get('vcode').value,data.msvendor_by_pk != null);
          if (data.msvendor_by_pk != null){
            this.vcdtxt = data.msvendor_by_pk.adrname;
          } else {
            this.vcdtxt = "";
            this.toastr.info("仕入先コード" + this.form.get('vcode').value + "は登録されていません");
          }
        },(error) => {
          console.log('error query get_vendors', error);
        });
    }
  } 

  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.denno=0; 
    this.form.get('tcode').setValue(this.usrsrv.staff?.code);
    this.form.get('day').setValue(new Date());
    this.form.get('soko').setValue("01"); 
    this.form.enable();
    this.usrsrv.enable_mtbl(this.form); 
    this.hmeitbl.frmArr.clear();  
    this.hmeitbl.add_rows(20);
  }  

  modeToUpd():void {
    this.mode=2;
    this.form.enable();
    this.usrsrv.enable_mtbl(this.form); 
    history.replaceState('','','./frmsupply/' + this.mode + '/' + this.denno);
  }

 cancel():void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode=3;
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('','','./frmsupply/' + this.mode + '/' + this.denno);
    }
  }

  save():void {

    let hatden:any={
      id: this.usrsrv.compid,
      vcode: this.usrsrv.editFrmval(this.form,'vcode'),
      day: this.usrsrv.editFrmval(this.form,'day'),
      soko: this.usrsrv.editFrmval(this.form,'soko'),
      tcode: this.usrsrv.editFrmval(this.form,'tcode'),
      dbiko: this.usrsrv.editFrmval(this.form,'dbiko'),
      inbiko: this.usrsrv.editFrmval(this.form,'inbiko'),
      gtotal: this.usrsrv.editFrmval(this.form,'gtotal'),
      ttotal: this.usrsrv.editFrmval(this.form,'ttotal'),
      tax: this.usrsrv.editFrmval(this.form,'tax'),
      total: this.usrsrv.editFrmval(this.form,'total'),
      updated_at:new Date(),
      updated_by:this.usrsrv.staff.code,
      jdenno:this.usrsrv.editFrmval(this.form,'jdenno')
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
