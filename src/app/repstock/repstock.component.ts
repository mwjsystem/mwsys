import { Component, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { SoukoService } from './../services/souko.service';
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
  constructor(private dialog: MatDialog,
              private route: ActivatedRoute,
              private title: Title,
              private apollo: Apollo,
              private elementRef: ElementRef,
              public cdRef: ChangeDetectorRef,
              public soksrv: SoukoService,
              public bunsrv: BunruiService,
              public stcsrv: StockService,
              public usrsrv: UserService) { 
                title.setTitle('在庫一覧(MWSystem)'); 
              }

  ngOnInit(): void {    
    this.bunsrv.get_bunrui();
    this.soksrv.get_souko();
    this.route.queryParams.subscribe(params => { 
        if(params.gcode !== null){
          this.gcode= params.gcode;
        }
        if(params.scode !== null){
          this.scode= params.scode;
        }
        this.refresh();
       });
  }
  onChange(): void {

  }
  onEnter(): void {
    this.elementRef.nativeElement.querySelector('button').focus();
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
            this.refresh();
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

  refresh():void {
    const GetMast = gql`
    query get_goods($id: smallint!, $gcode: String!) {
      msgoods_by_pk(id:$id, gcode:$gcode) {
        gtext
        gskbn
        iriunit
      }
    }`;

    // console.log("refresh",this.stcsrv.stgds);
    if( this.gcode ){
      this.stcsrv.get_shcount(this.gcode);
      this.apollo.watchQuery<any>({
        query: GetMast, 
          variables: { 
            id : this.usrsrv.compid,
            gcode:this.gcode
          },
        })
        .valueChanges
        .subscribe(({ data }) => {
          this.stcsrv.stgds.gtext=data.msgoods_by_pk.gtext;
          this.stcsrv.stgds.gskbn=data.msgoods_by_pk.gskbn;
          this.stcsrv.stgds.iriunit=data.msgoods_by_pk.iriunit;
          if(this.stcsrv.stgds.gskbn=="0"){
            this.stcsrv.get_stcscds(this.gcode,this.scode).subscribe();
          } else {

          }
          if(this.scode){
            history.replaceState('','','./repstock?gcode=' + this.gcode + '&scode=' + this.scode);
          }else{
            history.replaceState('','','./repstock?gcode=' + this.gcode);
          }
          this.cdRef.detectChanges();

        },(error) => {
          console.log('error query get_system', error);
        });

    }
  }

}
