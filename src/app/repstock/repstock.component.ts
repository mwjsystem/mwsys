import { Component, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
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
// import * as Query from './queries.frms';

@Component({
  selector: 'app-repstock',
  templateUrl: './repstock.component.html',
  styleUrls: ['./repstock.component.scss']
})
export class RepstockComponent implements OnInit {
  public gcode:string="";
  public scode:string="";
  public chSok:boolean=false;
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
    this.route.queryParams.subscribe(params => { 
        if(params.gcode !== null){
          this.gcode= params.gcode;
          this.get_zinfo(this.gcode);
        }
        // console.log(params.scode);
        if(params.scode !== null){
          this.scode= params.scode;
          this.chSok=true;
        }else{
          this.chSok=false;
        }
       });
  }
  onChange(): void {
    if (this.chSok == false){
      this.scode="";
      history.replaceState('','','./repstock?gcode=' + this.gcode);
    }else{
      history.replaceState('','','./repstock?gcode=' + this.gcode + '&scode=' + this.scode);
    }
    this.sel_scd(this.stcsrv.stcs);
  }
  onEnter(): void {
    this.get_zinfo(this.gcode);
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
            this.get_zinfo(this.gcode);
          }
      }
    );
  }
  setGname():void{

  }
  setNext(){
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
  sel_scd(pStcs){
    // this.get_zinfo(this.gcode);
    // console.log(pStcs,this.scode);
    if(this.scode){
      let i:number = pStcs.findIndex(obj => obj.scode == this.scode);
      this.stcsrv.stc.stock=pStcs[i].stock;
      this.stcsrv.stc.juzan=pStcs[i].juzan;
      this.stcsrv.stc.today=pStcs[i].today;
      this.stcsrv.stc.keepd=pStcs[i].keepd;
      this.stcsrv.stc.hikat=pStcs[i].hikat;
    } else {
      this.stcsrv.stc.stock=pStcs.reduce((prev, current) => {
        return prev + current.stock;
      }, 0);
      this.stcsrv.stc.juzan=pStcs.reduce((prev, current) => {
        return prev + current.juzan;
      }, 0);
      this.stcsrv.stc.today=pStcs.reduce((prev, current) => {
        return prev + current.today;
      }, 0);
      this.stcsrv.stc.keepd=pStcs.reduce((prev, current) => {
        return prev + current.keepd;
      }, 0);
      this.stcsrv.stc.hikat=pStcs.reduce((prev, current) => {
        return prev + current.hikat;
      }, 0);  
    }
    this.cdRef.detectChanges();
  }
  async get_zinfo(gcd:string){
    // console.log(this.gcode,this.stcsrv.gcode);
    // if (this.chSok == false){
    //   this.scode="";
    //   history.replaceState('','','./repstock?gcode=' + this.gcode);
    // }else{
    //   history.replaceState('','','./repstock?gcode=' + this.gcode + '&scode=' + this.scode);
    // }
    if( this.gcode ){
      this.gcode=this.usrsrv.convUpper(this.gcode);
      if (this.gcode != this.stcsrv.gcode){
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
        this.stcsrv.set_shcount(this.gcode);
        this.stcsrv.get_shcount(this.gcode,this.scode).then(result => {
          this.sel_scd(result);
          this.overlayRef.detach();
        });
      }
    }

    this.cdRef.detectChanges();
  }
}
