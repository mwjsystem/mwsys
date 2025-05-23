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
import { MembsService } from './../mstmember/membs.service';
import { StGds, Stock, StockService } from './../services/stock.service';
import { Trans, TransService } from './../services/trans.service';
// import { ToastrService } from 'ngx-toastr';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { StcscdsComponent } from './../share/stcscds/stcscds.component';
// import * as Query from './queries.frms';

@Component({
  selector: 'app-repstock',
  templateUrl: './repstock.component.html',
  styleUrls: ['./../app.component.scss']
})
export class RepstockComponent implements OnInit, AfterViewInit {
  public stgds: StGds = new StGds();
  public gcode: string = "";
  public scode: string = "";

  public isLoading: boolean = false;
  public isLoading2: boolean = false;
  public isLoading3: boolean = false;
  // public chSok:boolean=false;
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private title: Title,
    private apollo: Apollo,
    private elementRef: ElementRef,
    private overlay: Overlay,
    // private toastr: ToastrService,
    public cdRef: ChangeDetectorRef,
    public strsrv: StoreService,
    public bunsrv: BunruiService,
    public memsrv: MembsService,
    public stcsrv: StockService,
    public trnsrv: TransService,
    public usrsrv: UserService) {
    title.setTitle('現在庫確認(MWSystem)');
  }

  ngOnInit(): void {
    this.memsrv.getMembers();
    this.bunsrv.getBunrui();
    this.strsrv.getStore();
    this.stcsrv.getGoods();
  }

  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.route.queryParams.subscribe(params => {
      this.usrsrv.getStaff(this.usrsrv.userInfo['email']).then(result => {
        if (params['scode'] != null) {
          this.scode = params['scode'];
          //   this.chSok=true;
        } else {
          this.scode = result.scode
        }
        if (params['gcode'] != null) {
          this.gcode = params['gcode'];
          this.getZinfo();
        }
        this.cdRef.detectChanges();
      });
    });
  }

  convUpper(event: KeyboardEvent) {
    // console.log((event.target as HTMLInputElement));
    this.gcode = this.usrsrv.convUpper((event.target as HTMLInputElement)?.value);
  }

  onChange(): void {
    // if (this.chSok == false){
    //   this.scode="";
    //   history.replaceState('','','./repstock?gcode=' + this.gcode);
    // }else{
    // if (this.scode){

    // console.log('onChange', this.gcode, this.scode);
    this.selScd();
    // }

  }
  onEnter(): void {
    // console.log(this.usrsrv.staff.scode,this.scode != null);
    if (this.scode != null) {
    } else {
      this.scode = this.usrsrv.staff.scode;
    }
    if (this.gcode !== this.stcsrv.stcGcd) {
      this.stcsrv.stc.stock = 0;
      this.stcsrv.stc.juzan = 0;
      this.stcsrv.stc.today = 0;
      this.stcsrv.stc.keepd = 0;
      this.stcsrv.stc.hikat = 0;
      this.stcsrv.stc.tommo = 0;
    }
    // console.log('onEnter', this.gcode, this.stcsrv.stc);
    this.getZinfo();
    // this.trnsrv.subject.next();
  }

  gcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    dialogConfig.data = {
      gcode: this.gcode,
      tkbn: ['0', '1', '2']
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.gcode = data.gcode;
          this.stgds.gtext = data.gtext;
          this.getZinfo();
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
  setNext() {
    // console.log(this.stcsrv.goods);
    let i: number = this.stcsrv.goods.findIndex(obj => obj.gcode == this.gcode);
    if (i > -1 && i < this.stcsrv.goods.length) {
      this.gcode = this.stcsrv.goods[i + 1].gcode;
      this.getZinfo();
    }
  }

  setPrev() {
    let i: number = this.stcsrv.goods.findIndex(obj => obj.gcode == this.gcode);
    if (i > -1) {
      this.gcode = this.stcsrv.goods[i - 1].gcode;
      this.getZinfo();
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
  selScd() {
    console.log('selScd', this.scode, this.stgds, this.stcsrv.stc);
    if (this.stgds.gskbn == "0") {
      if (this.gcode == this.stcsrv.stcGcd && this.stcsrv.stcs.length !== 0) {
        console.log('selScd2', this.stcsrv.stcs, this.stcsrv.stcs.length !== 0, this.stcsrv.stc);

        let i: number = this.stcsrv.stcs.findIndex(obj => obj.scode == this.scode);
        console.log('selScd3', this.stcsrv.stcs, this.scode);
        if (i > -1) {
          this.stcsrv.stc.stock = this.stcsrv.stcs[i].stock;
          this.stcsrv.stc.juzan = this.stcsrv.stcs[i].juzan;
          this.stcsrv.stc.today = this.stcsrv.stcs[i].today;
          this.stcsrv.stc.keepd = this.stcsrv.stcs[i].keepd;
          this.stcsrv.stc.hikat = this.stcsrv.stcs[i].hikat;
          this.stcsrv.stc.tommo = this.stcsrv.stcs[i].tommo;
        } else {
          this.stcsrv.stc.stock = 0;
          this.stcsrv.stc.juzan = 0;
          this.stcsrv.stc.today = 0;
          this.stcsrv.stc.keepd = 0;
          this.stcsrv.stc.hikat = 0;
          this.stcsrv.stc.tommo = 0;
        }
      } else {
        if (this.scode && this.gcode) {
          this.isLoading2 = true;
          console.log('selScd4', this.stcsrv.stcs, this.scode);
          this.stcsrv.getStock(this.gcode, "0", this.scode).then(result => {
            console.log('result', result);
            this.isLoading2 = false;
            this.stcsrv.stc.stock = result[0]?.stock;
            this.stcsrv.stc.juzan = result[0]?.juzan;
            this.stcsrv.stc.today = result[0]?.today;
            this.stcsrv.stc.keepd = result[0]?.keepd;
            this.stcsrv.stc.hikat = result[0]?.hikat;
            this.stcsrv.stc.tommo = result[0]?.tommo;
            this.cdRef.detectChanges();
            // this.overlayRef.detach();
          });
        }
        if (this.gcode) {
          this.stcsrv.stcGcd = "";
          this.stcsrv.getStock(this.gcode, "0").then(result => {
            this.stcsrv.stcs = result;
            this.stcsrv.stcGcd = this.gcode;
            this.cdRef.detectChanges();
          });
        }
      }
      // console.log('selScd4', this.stcsrv.stc);
      this.isLoading3 = true;
      this.trnsrv.getTrans(this.gcode, this.scode, new Date()).then(result => {
        console.log('this.trnsrv.getTrans',result);
        this.trnsrv.tbldata = result;
        this.trnsrv.subject.next(true);
        this.isLoading3 = false;
      });




    } else if (this.stgds.gskbn == "1") {
      this.isLoading2 = true;
      this.stcsrv.getSetZai(this.scode, this.stgds.msgzais).then(result => {
        console.log('this.stcsrv.getSetZai',result);
        this.stcsrv.stcbs = result.sort(function (a, b) {
          return (a.gcode < b.gcode) ? -1 : 1;  //オブジェクトの昇順ソート
        });
        // this.stcsrv.stcGcd=this.gcode;
        this.stcsrv.subject.next(true);
        this.isLoading2 = false;
      });



    }

    if (this.gcode != this.stcsrv.shGcd) {
      this.isLoading = true;
      if (this.stgds.gskbn == "0") {
        this.stcsrv.getShcount0(this.gcode).then(result => {
          console.log('this.stcsrv.getShcount0',result);
          this.isLoading = false;
          this.stgds.moavg = result.moavg;
          this.stgds.motai = result.motai;
          this.stgds.yday = result.yday;
          this.stgds.suu = result.suu;
          this.stgds.ydtxt = result.ydtxt;
          this.stgds.htzan = result.htzan;
          this.cdRef.detectChanges();
        });
      } else if (this.stgds.gskbn == "1") {
        this.stcsrv.getShcount1(this.gcode).then(result => {
          this.isLoading = false;
          this.stgds.moavg = result.moavg;
          this.stgds.motai = result.motai;
          this.stgds.yday = null;
          this.stgds.suu = 0;
          this.stgds.ydtxt = '入荷予定日';
          this.stgds.htzan = 0;
          this.cdRef.detectChanges();
        });
      }
    }
    history.replaceState('', '', './repstock?gcode=' + this.gcode + '&scode=' + this.scode);
  }
  getZinfo() {
    // console.log('getZinfo', this.gcode, this.stcsrv.stc);
    if (this.gcode) {
      // this.stcsrv.stc.stock = 0;
      // this.stcsrv.stc.juzan = 0;
      // this.stcsrv.stc.today = 0;
      // this.stcsrv.stc.keepd = 0;
      // this.stcsrv.stc.hikat = 0;
      // this.stcsrv.stc.tommo = 0;
      this.gcode = this.usrsrv.convUpper(this.gcode);
      // console.log('getZinfo2', this.stcsrv.goods);
      if (this.stcsrv.goods.length == 0) {
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
            id: this.usrsrv.compid,
            gcd: this.gcode
          },
        })
          .valueChanges
          .subscribe(({ data }) => {
            this.stgds.gtext = data.msgoods_by_pk.gtext;
            this.stgds.gskbn = data.msgoods_by_pk.gskbn;
            this.stgds.unit = data.msgoods_by_pk.unit;
            this.stgds.msgzais = data.msgoods_by_pk.msgzais;
            // console.log(this.stgds.msgzais,this.stcsrv.goods);
            this.selScd();
          }, (error) => {
            console.log('error query get_goods', error);
          });
      } else {
        let i: number = this.stcsrv.goods.findIndex(obj => obj.gcode == this.gcode);
        if (i > -1) {
          this.stgds.gtext = this.stcsrv.goods[i].gtext;
          this.stgds.gskbn = this.stcsrv.goods[i].gskbn;
          this.stgds.unit = this.stcsrv.goods[i].unit;
          this.stgds.msgzais = this.stcsrv.goods[i].msgzais;
          this.selScd();
        } else {
          this.usrsrv.toastWar("商品コード" + this.gcode + "は登録されていません。");
        }

      }
    }
  }
}