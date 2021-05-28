import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { TrtdetailComponent } from './trtdetail.component';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { TreatService } from './treat.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { filter } from 'rxjs/operators';


@Component({
  selector: 'app-frmtreat',
  templateUrl: './frmtreat.component.html',
  styleUrls: ['./frmtreat.component.scss']
})
export class FrmtreatComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<mwI.Trtreat>;
  displayedColumns = ['created_at','created_by','genre','trttype','mcode','grpcode','gcode','tel','email','question','answer','kaizen','result'];
  fmcode:string="";
  fgrpcd:string="";
  fmail:string="";
  ftel:string="";
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  constructor(public trtsrv:TreatService,
              public usrsrv: UserService,
              public bunsrv: BunruiService,
              public stfsrv: StaffService,
              private title: Title,
              private route: ActivatedRoute,
              private dialog: MatDialog,
              private apollo: Apollo,
              private overlay: Overlay) {
                this.dataSource= new MatTableDataSource<mwI.Trtreat>(this.trtsrv.trts);
                this.dataSource.paginator = this.paginator;
                title.setTitle('問合せ一覧(MWSystem)'); 
               }

  ngOnInit(): void {
    this.bunsrv.get_bunrui();
    this.stfsrv.get_staff();
    this.overlayRef.attach(new ComponentPortal(MatSpinner));    
    // this.route.paramMap.subscribe((params: ParamMap)=>{
    //   if (params.get('param') !== null){
    //     let param = params.get('param');
    //     this.get_opelog({denno:params.get('denno')}).subscribe(value => {
    //       this.dataSource= new MatTableDataSource<mwI.Trtreat>(value);
    //       this.overlayRef.detach();
    //       this.cdRef.detectChanges();
    //     });         
    //   } 
    // }); 
    this.route.queryParamMap.pipe(
      filter(n=>Object.keys(n["params"]).length!==0)
      ).subscribe(
        n=>{
          let vars = {"id" : this.usrsrv.compid};
          let params = n["params"];
          // console.log(params);
          Object.keys(params).map(k=>{
            if (k=="mcode"){
              vars[k]= +params[k]
            } else if(k=="grpcd") {
              vars[k]= "%" + params[k] + "%"  
            }
          })
          this.get_treat(vars);
        }
      )

    this.trtsrv.observe.subscribe(()=> this.refresh);
    this.overlayRef.detach();

  }
  
  filterTreat(){

    
  }



  get_treat(params){
    const GetTrt = gql`
    query get_treat($id: smallint!, $mcode: Int, $grpcd: String) {
      trtreat(where: {id: {_eq: $id}, mcode: {_eq: $mcode}, grpcode: {_ilike: $grpcd}}, order_by: {seq: asc}) {
        genre
        mcode
        grpcode
        gcode
        email
        tel
        created_at
        created_by
        question
        answer
        kaizen
        seq
        result
        trttype
      }
    }`;
    
    // console.log(params);
    this.apollo.watchQuery<any>({
        query: GetTrt, 
        variables: params,
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.trtsrv.trts = data.trtreat;
        this.refresh();
        // console.log(this.trtsrv.trts);
      },(error) => {
        console.log('error query get_treat', error);
        // observer.next([]);
      });


  }
  
  diaDet(i:number){
    let dialogConfig = new MatDialogConfig();
    dialogConfig.data = {
        idx:i
    }; 
    dialogConfig.autoFocus = true;
    dialogConfig.height = '98%';
    let dialogRef = this.dialog.open(TrtdetailComponent, dialogConfig);   
  }
  refresh(): void {
    //tableのデータソース更新
    this.dataSource= new MatTableDataSource<mwI.Trtreat>(this.trtsrv.trts);
    this.dataSource.paginator = this.paginator;
  }
}
