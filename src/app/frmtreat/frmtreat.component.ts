import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
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
// import { ToastrService } from 'ngx-toastr';


/** get_treat クエリの変数。mcode は顧客コード、grpcd は商品グループ（あいまい検索） */
interface TreatVars { id: number; mcode?: number; grpcd?: string }
/** get_treat クエリの結果 */
interface TreatResult { trtreat: mwI.Trtreat[] }
@Component({
    selector: 'app-frmtreat',
    templateUrl: './frmtreat.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class FrmtreatComponent implements OnInit {
  trtsrv = inject(TreatService);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  stfsrv = inject(StaffService);
  private title = inject(Title);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);

  readonly paginator = viewChild(MatPaginator);
  dataSource: MatTableDataSource<mwI.Trtreat>;
  displayedColumns = ['created_at', 'created_by', 'genre', 'trttype', 'mcode', 'grpcode', 'gcode', 'tel', 'email', 'question', 'answer', 'kaizen', 'result'];
  fmcode: string = "";
  fgrpcd: string = "";
  fmail: string = "";
  ftel: string = "";
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });

  constructor() {
    const title = this.title;

    this.dataSource = new MatTableDataSource<mwI.Trtreat>(this.trtsrv.trts);
    this.dataSource.paginator = this.paginator() ?? null;
    title.setTitle('問合せ一覧(MWSystem)');
  }

  ngOnInit(): void {
    this.bunsrv.getBunrui();
    this.stfsrv.getStaff();
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
    this.route.queryParams.pipe(
      filter(p => Object.keys(p).length !== 0)
    ).subscribe(
      params => {
        let vars: TreatVars = { "id": this.usrsrv.compid };
        // console.log(params);
        Object.keys(params).map(k => {
          if (k == "mcode") {
            vars[k] = +params[k]
          } else if (k == "grpcd") {
            vars[k] = "%" + params[k] + "%"
          }
        })
        this.getTreat(vars);
      }
    )

    this.trtsrv.observe.subscribe(() => this.refresh);
    this.overlayRef.detach();

  }

  filterTreat() {
    let vars = { "id": this.usrsrv.compid };
    // if (this.fvcd){
    //   varWh.where._and.push({"vcode" : {"_eq":this.fvcd}});
    // }  
    // if (this.fday){
    //   varWh.where._and.push({"day" : {"_gt":this.fday}});
    // }   
    // if (this.fhdst.length>0){
    //   varWh.where._and.push({"hdstatus" : {"_in":this.fhdst}});
    // }         
    // if (this.ftcd){
    //   varWh.where._and.push({"tcode" : {"_eq":this.ftcd}});
    // }

  }



  getTreat(params: TreatVars) {
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
    this.apollo.watchQuery<TreatResult>({
      query: GetTrt,
      variables: params,
    })
      .valueChanges
      .subscribe(({ data }) => {
        this.trtsrv.trts = (data as TreatResult).trtreat;
        if (this.trtsrv.trts.length == 0) {
          this.usrsrv.toastInf("条件に一致する問合せ記録はありません");
        }
        this.refresh();
        // console.log(this.trtsrv.trts);
      }, (error) => {
        console.log('error query get_treat', error);
        // observer.next([]);
      });


  }

  diaDet(i: number) {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.data = {
      idx: i
    };
    dialogConfig.autoFocus = true;
    dialogConfig.height = '98%';
    let dialogRef = this.dialog.open(TrtdetailComponent, dialogConfig);
  }
  refresh(): void {
    //tableのデータソース更新
    this.dataSource = new MatTableDataSource<mwI.Trtreat>(this.trtsrv.trts);
    this.dataSource.paginator = this.paginator() ?? null;
  }
}
