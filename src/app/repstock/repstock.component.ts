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
import { StGds,Stock, StockService } from './../services/stock.service';
import { ToastrService } from 'ngx-toastr';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { StcscdsComponent } from './../share/stcscds/stcscds.component';
// import * as Query from './queries.frms';

@Component({
  selector: 'app-repstock',
  templateUrl: './repstock.component.html',
  styleUrls: ['./repstock.component.scss']
})
export class RepstockComponent implements OnInit, AfterViewInit {
  public stgds:StGds=new StGds();
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
              private toastr: ToastrService,
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
    this.stcsrv.getGoods();
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
            this.stgds.gtext=data.gtext;
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
    // console.log(this.stcsrv.goods);
    let i:number = this.stcsrv.goods.findIndex(obj => obj.gcode == this.gcode);
    if(i > -1 && i < this.stcsrv.goods.length){
      this.gcode = this.stcsrv.goods[i+1].gcode;
      this.get_zinfo();
    }
  }

  setPrev(){
    let i:number = this.stcsrv.goods.findIndex(obj => obj.gcode == this.gcode);
    if(i > -1 ){
      this.gcode = this.stcsrv.goods[i-1].gcode;
      this.get_zinfo();
    }
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
    if (this.stgds.gskbn=="0"){
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
          this.stcsrv.get_stock(this.gcode,"0",this.scode).then(result => {
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
          this.stcsrv.get_stock(this.gcode,"0").then(result => {
            this.stcsrv.stcs=result;
            this.stcsrv.stcGcd=this.gcode;
            this.cdRef.detectChanges();
          });
        }
      }
    } else if (this.stgds.gskbn=="1"){
      this.isLoading2=true;
      this.stcsrv.getSetZai(this.scode,this.stgds.msgzais).then(result => {
        console.log(result);
        this.stcsrv.stcbs=result.sort(function(a, b) {
          return (a.gcode < b.gcode) ? -1 : 1;  //オブジェクトの昇順ソート
        });
        // this.stcsrv.stcGcd=this.gcode;
        this.stcsrv.subject.next();
        this.isLoading2=false;
      });
    }

    if (this.gcode != this.stcsrv.shGcd){
      this.isLoading=true;
      if (this.stgds.gskbn=="0"){
        this.stcsrv.get_shcount0(this.gcode).then(result=>{
          this.isLoading=false;
          this.stgds.moavg=result.moavg;
          this.stgds.motai=result.motai;
          this.stgds.yday=result.yday;
          this.stgds.suu=result.suu;
          this.stgds.ydtxt=result.ydtxt;
          this.stgds.htzan=result.htzan;
          this.cdRef.detectChanges();
        });
      } else if (this.stgds.gskbn=="1"){
        this.stcsrv.get_shcount1(this.gcode).then(result=>{
          this.isLoading=false;
          this.stgds.moavg=result.moavg;
          this.stgds.motai=result.motai;
          this.stgds.yday=null;
          this.stgds.suu=0;
          this.stgds.ydtxt='入荷予定日';
          this.stgds.htzan=0;
          this.cdRef.detectChanges();
        });
      }
    }  
    history.replaceState('','','./repstock?gcode=' + this.gcode + '&scode=' + this.scode);
  }
  get_zinfo(){    
    if(this.gcode){
      this.stcsrv.stc.stock=0;
      this.stcsrv.stc.juzan=0;
      this.stcsrv.stc.today=0;
      this.stcsrv.stc.keepd=0;
      this.stcsrv.stc.hikat=0;
      this.stcsrv.stc.tommo=0;
      this.gcode=this.usrsrv.convUpper(this.gcode);
      if(this.stcsrv.goods.length==0){
        const GetMast = gql`
        query get_goods($id: smallint!,$gcd:String!) {
          msgoods_by_pk(id:$id, gcode:$gcd) {
            gcode
            gtext
            gskbn
            unit
            msgzais{
              zcode
              irisu
              msgoods {
                gskbn
              }
            }
          }
        }`;
        this.apollo.watchQuery<any>({
          query: GetMast, 
            variables: { 
              id : this.usrsrv.compid,
              gcd : this.gcode
            },
          })
          .valueChanges
          .subscribe(({ data }) => {
            this.stgds.gtext = data.msgoods_by_pk.gtext;
            this.stgds.gskbn = data.msgoods_by_pk.gskbn;
            this.stgds.unit = data.msgoods_by_pk.unit;
            this.stgds.msgzais=data.msgoods_by_pk.msgzais;
            // console.log(this.stgds.msgzais,this.stcsrv.goods);
            this.sel_scd();
          },(error) => {
            console.log('error query get_goods', error);
          });
      }else{
        let i:number = this.stcsrv.goods.findIndex(obj => obj.gcode == this.gcode);
        if(i>-1){
          this.stgds.gtext = this.stcsrv.goods[i].gtext;
          this.stgds.gskbn = this.stcsrv.goods[i].gskbn;
          this.stgds.unit = this.stcsrv.goods[i].unit;
          this.stgds.msgzais= this.stcsrv.goods[i].msgzais;
          this.sel_scd(); 
        }else{
          this.toastr.warning("商品コード" + this.gcode + "は登録されていません。");
        }

      }
    }
  }
}
