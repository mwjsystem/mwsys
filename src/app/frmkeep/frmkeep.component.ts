import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatTableDataSource } from '@angular/material/table';
import { Observable } from 'rxjs';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { BunruiService } from './../services/bunrui.service';
import { DownloadService } from './../services/download.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
// import { ToastrService } from 'ngx-toastr';

interface GetOpe {
  denno?: string;
  status?: string;
}

@Component({
  selector: 'app-frmkeep',
  templateUrl: './frmkeep.component.html',
  styleUrls: ['./frmkeep.component.scss']
})
export class FrmkeepComponent implements OnInit {
  denno: number;
  // temp:mwI.Tropelog[]=[];
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<mwI.Tropelog>;
  displayedColumns = ['actionsColumn', 'sequ', 'keycode', 'extype', 'created_by', 'created_at', 'status', 'updated_by', 'updated_at', 'memo'];
  private GetLog = gql`
    query get_opelog($id:smallint!,$typ:String!,$kcd:[String!],$sts:[String!]) {
      tropelog(where:{id:{_eq:$id}, keycode:{_in:$kcd}, extype:{_eq:$typ}, status:{_in:$sts}}, order_by:{sequ: asc}) {
        sequ
        keycode
        extype
        memo
        created_by
        created_at
        status
        updated_by
        updated_at
      }
    }`;
  private keycode: string[] = null;
  private status: string[] = null;
  constructor(public usrsrv: UserService,
    public cdRef: ChangeDetectorRef,
    public stfsrv: StaffService,
    public bunsrv: BunruiService,
    private apollo: Apollo,
    // private toastr: ToastrService,
    private dwlsrv: DownloadService,
    private overlay: Overlay,
    private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    // this.stfsrv.get_staff();
    // console.log('start');
    this.route.paramMap.subscribe((params: ParamMap) => {
      // console.log('param',params);
      if (params.get('denno') !== null) {
        this.denno = +params.get('denno');
        this.get_opelog({ denno: params.get('denno') }).subscribe(value => {
          console.log(value);
          this.dataSource = new MatTableDataSource<mwI.Tropelog>(value);
          this.overlayRef.detach();
          this.cdRef.detectChanges();
        });
      } else {
        this.get_opelog({ status: "依頼中" }).subscribe(value => {
          console.log(value);
          this.denno = 0;
          this.dataSource = new MatTableDataSource<mwI.Tropelog>(value);
          console.log('after', this.dataSource);
          this.overlayRef.detach();
          this.cdRef.detectChanges();
        });
      }
    });
  }

  get_opelog(param: GetOpe): Observable<mwI.Tropelog[]> {
    if (param['denno']) {
      this.keycode = [param['denno']];
    }

    if (param['status']) {
      this.status = [param['status']];
    }
    console.log(this.keycode, this.status);
    // return new Promise( resolve => {
    let observable: Observable<mwI.Tropelog[]> = new Observable<mwI.Tropelog[]>(observer => {
      this.apollo.watchQuery<any>({
        query: this.GetLog,
        variables: {
          id: this.usrsrv.compid,
          typ: '8',
          kcd: this.keycode,
          sts: this.status
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data.tropelog);
          observer.next(data.tropelog);
          // return resolve(data.tropelog);
          // observer.complete();
          // console.log(data.tropelog);
        }, (error) => {
          console.log('error query get_opelog', error);
          // return resolve([]); 
          observer.error(error);
        });
    });
    return observable;
  }

  to_Req() {
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.denno = 0;
    this.get_opelog({ status: "依頼中" }).subscribe(value => {
      this.dataSource = new MatTableDataSource<mwI.Tropelog>(value);
      this.overlayRef.detach();
      this.cdRef.detectChanges();
      history.replaceState('', '', './frmkeep');
    });
  }

  to_Denno(pdenno) {
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.get_opelog({ denno: pdenno }).subscribe(value => {
      this.dataSource = new MatTableDataSource<mwI.Tropelog>(value);
      this.overlayRef.detach();
      this.cdRef.detectChanges();
      history.replaceState('', '', './frmkeep/') + pdenno;
    });
  }


  confKeep(i: number) {
    const UpdateOpelog = gql`
    mutation iupdLog($seq: Int!, $obj: tropelog_set_input!) {
      update_tropelog(where: {sequ: {_eq: $seq}}, _set: $obj) {
        returning {
          status
          updated_at
          updated_by
        }
      }
    }`;
    this.apollo.mutate<any>({
      mutation: UpdateOpelog,
      variables: {
        "seq": this.dataSource.data[i].sequ,
        "obj": {
          updated_by: this.usrsrv.staff.code.toString(),
          status: 'キープ済',
          updated_at: new Date()
        }
      },
      refetchQueries: [
        {
          query: this.GetLog,
          variables: {
            id: this.usrsrv.compid,
            typ: '8',
            kcd: this.keycode,
            sts: this.status
          },
        }],
    }).subscribe(({ data }) => {
      this.usrsrv.toastInf("処理しました");
      let temp: mwI.Tropelog[] = this.dwlsrv.pickObjArr(this.dataSource.data, ['sequ', 'keycode', 'extype', 'created_by', 'created_at', 'status', 'updated_by', 'updated_at', 'memo']);
      // console.log(temp);
      temp[i].status = data.update_tropelog.returning[0].status;
      temp[i].updated_by = data.update_tropelog.returning[0].updated_by;
      temp[i].updated_at = data.update_tropelog.returning[0].updated_at;
      this.dataSource = new MatTableDataSource<mwI.Tropelog>(temp);
      this.cdRef.detectChanges();
      // this.get_opelog(this.denno.toString()).subscribe(value => {
      //   this.dataSource= new MatTableDataSource<mwI.Tropelog>(value);
      //   console.log('subscribe',value);
      //   this.cdRef.detectChanges();
      // });      
    }, (error) => {
      console.log('error query update_opelog', error);
    });
    // console.log(this.denno);
  }
}
