import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, HostListener, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { SoukoService } from './../services/souko.service';
import { DownloadService } from './../services/download.service';

@Component({
  selector: 'app-frmsupply',
  templateUrl: './frmsupply.component.html',
  styleUrls: ['./../app.component.scss']
})
export class FrmsupplyComponent implements OnInit {
  form: FormGroup;
  denno:number|string;
  mode: number=3;
  vcdtxt:string;
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
              private apollo: Apollo,
              private toastr: ToastrService,
              private overlay: Overlay,
              private cdRef:ChangeDetectorRef) {
      title.setTitle('発注伝票(MWSystem)');  
  }

  ngOnInit(): void {
    this.soksrv.get_souko();
    this.bunsrv.get_bunrui();
    this.stfsrv.get_staff();
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('denno') !== null){
        this.denno = +params.get('denno');
        // console.log(this.denno);
        // this.get_jyuden(this.denno);
      }
      if (params.get('mode') === null){
        this.mode = 3;
      }else{
        this.mode = +params.get('mode');
      } 
    }); 
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
    // dialogConfig.width  = '100vw';
    // dialogConfig.height = '98%';
    // dialogConfig.panelClass= 'full-screen-modal';
    // let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    
    // dialogRef.afterClosed().subscribe(
    //   data=>{
    //       if(typeof data != 'undefined'){
    //         this.form.get(fldnm).setValue(data.vcode);
    //       }
    //   }
    // );
  }

  refresh():void {
    if (this.denno !=null ){
      this.denno=this.usrsrv.convNumber(this.denno);
      // this.get_hatden(this.denno);
    }
    
    // console.log(this.jmisrv.jyumei);
  }  

  dennoHelp(){

  }

  setVcdtxt(){
    // let vcd:number=this.form.getRawValue().vcode;
    // // console.log(this.form.getRawValue().mcode,this.membs);
    // const i:number = this.vensrv.vends.findIndex(obj => obj.vcode == vcd);
    // // console.log(i);
    // if(i > -1 ){
    //   this.vcdtxt = this.vensrv.vends[i].mei ?? "";
    //   this.vcdtxt = this.vensrv.vends[i].sei + this.vcdtxt;
    // } else {
    //   this.vcdtxt="";  
    // }
  } 

  modeToCre():void {
    this.mode=1;
    this.form.reset();
  }  

  modeToUpd():void {
    this.mode=2;
    this.refresh();
    history.replaceState('','','./frmsupply/' + this.mode + '/' + this.denno);
  }

 cancel():void {
    this.mode=3;
    this.refresh();
    this.form.markAsPristine();
    history.replaceState('','','./frmsupply/' + this.mode + '/' + this.denno);
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
