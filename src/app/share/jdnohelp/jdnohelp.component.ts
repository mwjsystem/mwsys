import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
import { BunruiService } from './../../services/bunrui.service';
import { MembsService } from './../../services/membs.service';
import { McdhelpComponent } from './../mcdhelp/mcdhelp.component';


interface Jyuden {
  denno:number;
  day:Date;
  yday:Date;
  sday:Date;
  uday:Date;
  nday:Date;
  mcode:number;
  scode:number;
  ncode:number;
  nadr:number;
  souko:string;
  tcode:number;
  tcode1:number;
  jdstatus:string;
  jdshsta:string;
  keep:string;
  cusden:string;
  okurino:string;
  pcode:string;
} 

@Component({
  selector: 'app-jdnohelp',
  templateUrl: './jdnohelp.component.html',
  styleUrls: ['./jdnohelp.component.scss']
})
export class JdnohelpComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  dataSource:MatTableDataSource<Jyuden>;
  subject = new Subject<Jyuden[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'day',
    'yday',
    'sday',
    'uday',
    'nday',
    'mcode',
    'nadr',
    'souko',
    'tcode',
    'keep',
    'okurino',
    'cusden',
    // 'skbn',
    // 'torikbn',
    'pcode',
    'tcode1 ',
    'del',
    'updated_at',
    'updated_by',
    'scode',
    'ncode'
  ]; 
  fmcdfld:string="mcode";
  fmcd:number;
  fdayfld:string="day";
  fday:Date=new Date();
  ftcd:string="";
  // mcdtxt:string="";
  fcusden:string="";
  fjdst:string="";
  fjsst:string="";

  constructor(public usrsrv: UserService,
              public stfsrv: StaffService,
              public memsrv: MembsService,
              public bunsrv: BunruiService,
              public cdRef: ChangeDetectorRef,
              private apollo: Apollo,
              private overlay: Overlay,
              private dialog: MatDialog,
              private dialogRef: MatDialogRef<JdnohelpComponent>) {
                this.dataSource= new MatTableDataSource<Jyuden>();
               }

  ngOnInit(): void {
      this.ftcd=this.usrsrv.staff?.code;
      this.fday.setMonth(this.fday.getMonth() - 1);
      // this.observe.subscribe(value => {
      //     this.dataSource.paginator = this.paginator;
      //     this.dataSource= new MatTableDataSource<Jyuden>(value);
      //     this.overlayRef.detach();
      //     this.cdRef.detectChanges();
      // });  
  }

  mcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass= 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.fmcd=data.mcode;
            // this.set_mcdtxt(this.fmcd);
          }
      }
    );
  }

  // set_mcdtxt(mcd:number){
  //   this.mcdtxt=this.memsrv.get_mcdtxt(mcd);
  // }
  get_jyuden():void{
    let varWh: {[k: string]: any}={"where" : {"_and":[{"id": {"_eq": this.usrsrv.compid}}]}};
    if (this.fmcd>0){
      let fldobj: {[k: string]: any}={};
      fldobj[this.fmcdfld]={"_eq": this.fmcd};
      varWh.where._and.push(fldobj);
    }  
    if (this.fday){
      let fldobj: {[k: string]: any}={};
      fldobj[this.fdayfld]={"_gt": this.usrsrv.formatDate(this.fday)};
      varWh.where._and.push(fldobj);
    }     
    if (this.ftcd){
      varWh.where._and.push({"tcode" : {"_eq":this.ftcd}});
    }

    // console.log(varWh);
    
    const GetTran = gql`
    query get_jyuden($where:trjyuden_bool_exp!) {
      trjyuden(where:$where, order_by:{denno: asc}) {
        denno
        day
        yday
        sday
        uday
        nday
        hday
        htime
        hcode
        ncode
        nadr
        souko
        tcode
        keep
        okurino
        cusden
        skbn
        torikbn
        mcode
        scode
        pcode
        tcode1 
        del
        updated_at
        updated_by
      }
    }`;
    this.overlayRef.attach(new ComponentPortal(MatSpinner)); 
    this.apollo.watchQuery<any>({
        query: GetTran, 
        variables: varWh
    })
    .valueChanges
    .subscribe(({ data }) => {
      // console.log(data);
      // this.subject.next(data.trjyuden);
      this.dataSource= new MatTableDataSource<Jyuden>(data.trjyuden);
      this.dataSource.paginator = this.paginator;
      this.overlayRef.detach();
      this.cdRef.detectChanges();
      // this.subject.complete();
    },(error) => {
      console.log('error query get_jyuden', error);
    });
  }
  sel_dno(selected:Jyuden) {
    // console.log("select",selected);
    // this.vcds=[];
    this.dialogRef.close(selected);
  }

  close() {
    // this.vcds=[];
    this.dialogRef.close();
  }
}
