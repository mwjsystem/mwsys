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
import { VendsService } from './../../services/vends.service';
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';

interface Hatden {
  denno:number;
  day:Date;
  hdstatus:string;
  vcode:string;
  souko:string;
  tcode:number;
  del:boolean;
  updated_at:Date;
  updated_by:string;
} 

@Component({
  selector: 'app-hdnohelp',
  templateUrl: './hdnohelp.component.html',
  styleUrls: ['./hdnohelp.component.scss']
})
export class HdnohelpComponent implements OnInit {
@ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource:MatTableDataSource<Hatden>;
  subject = new Subject<Hatden[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'day',
    'hdstatus',
    'vcode',
    'soko',
    'tcode',
    // 'del',
    'updated_at',
    'updated_by'
  ];

  fvcd:string="";
  fday:Date=new Date();
  ftcd:string="";
  fhdst=["1","2","3","4"];

  constructor(public usrsrv: UserService,
              public stfsrv: StaffService,
              public vensrv: VendsService,
              public bunsrv: BunruiService,
              public cdRef: ChangeDetectorRef,
              private apollo: Apollo,
              private overlay: Overlay,
              private dialog: MatDialog,
              private dialogRef: MatDialogRef<HdnohelpComponent>) {
                this.dataSource= new MatTableDataSource<Hatden>();
               }

  ngOnInit(): void {
      this.ftcd=this.usrsrv.staff?.code;
      this.fday.setMonth(this.fday.getMonth() - 1);
  }
  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass= 'full-screen-modal';
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.fvcd=data.vcode;
            // this.set_mcdtxt(this.fmcd);
          }
      }
    );
  }
  get_hatden():void{
    let varWh: {[k: string]: any}={"where" : {"_and":[{"id": {"_eq": this.usrsrv.compid}}]}};
    if (this.fvcd){
      varWh.where._and.push({"vcode" : {"_eq":this.fvcd}});
    }  
    if (this.fday){
      varWh.where._and.push({"day" : {"_gt":this.fday}});
    }   
    if (this.fhdst.length>0){
      varWh.where._and.push({"hdstatus" : {"_in":this.fhdst}});
    }         
    if (this.ftcd){
      varWh.where._and.push({"tcode" : {"_eq":this.ftcd}});
    }

    // console.log(this.fhdst,varWh);
    
    const GetTran = gql`
    query get_hatden($where:trhatden_bool_exp!) {
      trhatden(where:$where, order_by:{denno: asc}) {
        denno
        day
        hdstatus
        soko
        vcode
        tcode 
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
      this.dataSource= new MatTableDataSource<Hatden>(data.trhatden);
      this.dataSource.paginator = this.paginator;
      this.overlayRef.detach();
      this.cdRef.detectChanges();
    },(error) => {
      console.log('error query get_hatden', error);
    });
  }
  sel_dno(selected:Hatden) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
