import { Component, OnInit, AfterViewInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Title } from '@angular/platform-browser';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StoreService } from './../services/store.service';
import { Stock, StockService } from './../services/stock.service';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { StcscdsComponent } from './../share/stcscds/stcscds.component';
// import * as Query from './queries.frms';

@Component({
  selector: 'app-repstock',
  templateUrl: './repstock.component.html',
  styleUrls: ['./repstock.component.scss']
})
export class RepstockComponent implements OnInit, AfterViewInit {
  public gcode:string="";
  public scode:string="";
  public isLoading:boolean=false;
  public isLoading2:boolean=false;
  // public chSok:boolean=false;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(private dialog: MatDialog,
              private route: ActivatedRoute,
              private title: Title,
              private apollo: Apollo,
              private elementRef: ElementRef,
              private overlay: Overlay,
              public cdRef: ChangeDetectorRef,
              public strsrv: StoreService,
              public bunsrv: BunruiService,
              public stcsrv: StockService,
              public usrsrv: UserService) { 
                title.setTitle('現在庫確認(MWSystem)'); 
              }

  ngOnInit(): void {    
    this.bunsrv.get_bunrui();
    this.strsrv.get_store();
  }
  
  ngAfterViewInit():void{ //子コンポーネント読み込み後に走る
    this.route.queryParams.subscribe(params => { 
      this.usrsrv.getStaff(this.usrsrv.userInfo.email).then(result => {
        if(params.scode != null){
            this.scode= params.scode;
          //   this.chSok=true;
        }else{   
          this.scode = result.scode
        }
        if(params.gcode != null){
          this.gcode= params.gcode;
          this.get_zinfo();
        }
        this.cdRef.detectChanges();  
      });
    });
  }
  onChange(): void {
    // if (this.chSok == false){
    //   this.scode="";
    //   history.replaceState('','','./repstock?gcode=' + this.gcode);
    // }else{
    // if (this.scode){
    // console.log(this.scode); 
    this.sel_scd();
    // }
    
  }
  onEnter(): void {
    // console.log(this.gcode);
    this.get_zinfo();
    // console.log(this.gcode);
  } 

  gcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.gcode=data.gcode;
            this.stcsrv.stgds.gtext=data.gtext;
            this.get_zinfo();
          }
      }
    );
  }
  showStcscds(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(StcscdsComponent, dialogConfig);
  }
  setGname(): void {

  }
  setNext(){
    console.log(this.usrsrv.staff,this.usrsrv.holidays);
    // let i:number = this.gdssrv.get_Goods().findIndex(obj => obj.gcode == this.gcode.toUpperCase());
    // if(i > -1 && i < this.gdssrv.get_Goods().length){
    //   this.gcode = this.gdssrv.get_Goods()[i+1].gcode;
    // }
    // this.refresh();
  }

  setPrev(){
    // let i:number = this.gdssrv.get_Goods().findIndex(obj => obj.gcode == this.gcode.toUpperCase());
    // if(i > -1 ){
    //   this.gcode = this.gdssrv.get_Goods()[i-1].gcode;
    // }
    // this.refresh();
  }

  showChart(): void {
    // let dialogConfig = new MatDialogConfig();

    // dialogConfig.autoFocus = true;
    
    // dialogConfig.data = {
    //     shcnt: this.stcsrv.shcnt,
    //     shlas: this.stcsrv.shlas,
    //     utime: this.utime
    // };
    
    // let dialogRef = this.dialog.open(ShcntChartComponent, dialogConfig);

  } 
  public outputCsv(event: any) {
    
  }
  sel_scd(){
    // this.get_zinfo(this.gcode);
    // console.log(this.gcode,this.scode);
    // console.log(this.stcsrv.stcGcd,this.stcsrv.stcs);
    // if(this.scode){

    if (this.gcode == this.stcsrv.stcGcd) {
      let i:number = this.stcsrv.stcs.findIndex(obj => obj.scode == this.scode);
      this.stcsrv.stc.stock=this.stcsrv.stcs[i].stock;
      this.stcsrv.stc.juzan=this.stcsrv.stcs[i].juzan;
      this.stcsrv.stc.today=this.stcsrv.stcs[i].today;
      this.stcsrv.stc.keepd=this.stcsrv.stcs[i].keepd;
      this.stcsrv.stc.hikat=this.stcsrv.stcs[i].hikat;
      this.stcsrv.stc.tommo=this.stcsrv.stcs[i].tommo;
    } else {
      if(this.scode && this.gcode){
        this.isLoading2=true;
        this.stcsrv.get_stock(this.gcode,this.scode).then(result => {
          // console.log('result',result);
          this.isLoading2=false;
          this.stcsrv.stc.stock=result[0]?.stock;
          this.stcsrv.stc.juzan=result[0]?.juzan;
          this.stcsrv.stc.today=result[0]?.today;
          this.stcsrv.stc.keepd=result[0]?.keepd;
          this.stcsrv.stc.hikat=result[0]?.hikat;
          this.stcsrv.stc.tommo=result[0]?.tommo;
          this.cdRef.detectChanges();
          // this.overlayRef.detach();
        });
      }
      if(this.gcode){
        this.stcsrv.stcGcd="";
        this.stcsrv.get_stock(this.gcode).then(result => {
          this.stcsrv.stcs=result;
          this.stcsrv.stcGcd=this.gcode;
          this.cdRef.detectChanges();
        });
      }
    }
    history.replaceState('','','./repstock?gcode=' + this.gcode + '&scode=' + this.scode);
    
    
    // } else {
    //   this.stcsrv.stc.stock=pStcs.reduce((prev, current) => {
    //     return prev + current.stock;
    //   }, 0);
    //   this.stcsrv.stc.juzan=pStcs.reduce((prev, current) => {
    //     return prev + current.juzan;
    //   }, 0);
    //   this.stcsrv.stc.today=pStcs.reduce((prev, current) => {
    //     return prev + current.today;
    //   }, 0);
    //   this.stcsrv.stc.keepd=pStcs.reduce((prev, current) => {
    //     return prev + current.keepd;
    //   }, 0);
    //   this.stcsrv.stc.hikat=pStcs.reduce((prev, current) => {
    //     return prev + current.hikat;
    //   }, 0);  
    // }
    // this.cdRef.detectChanges();
  }
  get_zinfo(){
    this.stcsrv.stc.stock=0;
    this.stcsrv.stc.juzan=0;
    this.stcsrv.stc.today=0;
    this.stcsrv.stc.keepd=0;
    this.stcsrv.stc.hikat=0;
    this.stcsrv.stc.tommo=0;
    if( this.gcode ){
      this.gcode=this.usrsrv.convUpper(this.gcode);
      if (this.gcode != this.stcsrv.shGcd){
        this.isLoading=true;
        this.stcsrv.set_shcount(this.gcode).then(()=>{
          this.isLoading=false;
          this.cdRef.detectChanges();
        });
      }
      this.sel_scd();
      //   this.overlayRef.attach(new ComponentPortal(MatSpinner));
      // this.overlayRef.detach();
    }
  }
}
