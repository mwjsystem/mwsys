import { Component, OnInit, OnDestroy, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef, MatDialog, MatDialogConfig, MatDialogTitle, MatDialogContent, MatDialogActions } from "@angular/material/dialog";
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Subject, Subscription } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';
// import { BunruiService } from './../../services/bunrui.service';
import { VendsService } from './../../mstvendor/vends.service';
import { VcdhelpComponent } from './../vcdhelp/vcdhelp.component';
import { HasuraWhere } from './../help-where';
import { MatFormField, MatLabel, MatInput, MatSuffix, MatHint } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { StaffPipe } from '../../core/pipes/staff.pipe';
import { VcdtxtPipe } from '../../core/pipes/vcdtxt.pipe';
import { faxLabel } from '../../frmsupply/hat-forms';

interface Hatden {
  denno: number;
  day: Date;
  // hdstatus: string;
  vcode: string;
  scode: string;
  tcode: number;
  del?: boolean; // get_hatden では取得しない
  updated_at: Date;
  updated_by: string;
  gcode: string;
  ofax_at?: string | null;
  refax_at?: string | null;
  sfax_at?: string | null;
  /** FAX の流れ（済んだ一番後の段階） */
  fax?: string;
}

/** get_hatden クエリの行。発注明細（1 行目）の商品コードが入れ子で付く */
interface HatdenRow extends Omit<Hatden, 'gcode'> { trhatmeis: { gcode: string }[] }
/** get_hatden クエリの結果 */
interface HatdenResult { trhatden: HatdenRow[] }
@Component({
    selector: 'app-hdnohelp',
    templateUrl: './hdnohelp.component.html',
    styleUrls: ['./../../help.component.scss', './../search-dialog.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogTitle, MatFormField, MatLabel, MatSelect, FormsModule, MatOption, MatInput, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MatIconButton, MatIcon, MatHint, MatButton, CdkScrollable, MatDialogContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, MatDialogActions, DatePipe, StaffPipe, VcdtxtPipe]
})
export class HdnohelpComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  vensrv = inject(VendsService);
  cdRef = inject(ChangeDetectorRef);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private dialog = inject(MatDialog);
  private dialogRef = inject<MatDialogRef<HdnohelpComponent>>(MatDialogRef);

  readonly paginator = viewChild(MatPaginator);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  dataSource: MatTableDataSource<Hatden>;
  subject = new Subject<Hatden[]>();
  observe = this.subject.asObservable();
  displayedColumns = [
    'denno',
    'day',
    // 'hdstatus',
    'vcode',
    'scode',
    'tcode',
    'fax',
    // 'del',
    'updated_at',
    'updated_by',
    'gcode'
  ];

  fvcd: string = "";
  fday: Date = new Date();
  ftcd: string = "";
  /** FAX の流れ: '' すべて / ofax ①発注先へFAX がまだ / refax ②Refax がまだ / sfax ③倉庫へFAX がまだ */
  ffax: '' | 'ofax' | 'refax' | 'sfax' = '';
  // fhdst = ["1", "2", "3", "4"];
  private querySub?: Subscription;

  constructor() {
    this.dataSource = new MatTableDataSource<Hatden>();
  }

  ngOnInit(): void {
    this.ftcd = this.usrsrv.staff?.code;
    this.fday.setMonth(this.fday.getMonth() - 1);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.overlayRef.dispose();
  }

  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.fvcd = data.code;
          // this.set_mcdtxt(this.fmcd);
        }
      }
    );
  }
  get_hatden(): void {
    let varWh: HasuraWhere = { "where": { "_and": [{ "id": { "_eq": this.usrsrv.compid } }] } };
    if (this.fvcd) {
      varWh.where._and.push({ "vcode": { "_eq": this.fvcd } });
    }
    if (this.fday) {
      varWh.where._and.push({ "day": { "_gt": this.fday } });
    }
    // if (this.fhdst.length > 0) {
    //   varWh.where._and.push({ "hdstatus": { "_in": this.fhdst } });
    // }
    if (this.ftcd) {
      varWh.where._and.push({ "tcode": { "_eq": this.ftcd } });
    }
    // FAX の流れで、その段階がまだのもの（前の段階は済）
    if (this.ffax == 'ofax') {
      varWh.where._and.push({ "ofax_at": { "_is_null": true } });
    } else if (this.ffax == 'refax') {
      varWh.where._and.push({ "ofax_at": { "_is_null": false } }, { "refax_at": { "_is_null": true } });
    } else if (this.ffax == 'sfax') {
      varWh.where._and.push({ "refax_at": { "_is_null": false } }, { "sfax_at": { "_is_null": true } });
    }

    // console.log(this.fhdst,varWh);

    this.runQuery(varWh, true);
  }

  /**
   * 検索する。fax = true は FAX の流れの列（ofax_at など）も読む。
   * その列が読めない（列が無い・Hasura の権限に入っていない）ときは、列を除いて検索し直す。
   * エラーのときも読み込み中の表示を消す（以前は Apollo v4 がエラーを結果の error で返すと、読み込み中のまま止まった）
   */
  private runQuery(varWh: HasuraWhere, fax: boolean) {
    const GetTran = fax ? gql`
    query get_hatden($where:trhatden_bool_exp!) {
      trhatden(where:$where, order_by:{denno: asc}) {
        denno day scode vcode tcode updated_at updated_by
        ofax_at refax_at sfax_at
        trhatmeis(where:{line:{_eq:1}}){ gcode }
      }
    }` : gql`
    query get_hatden_nofax($where:trhatden_bool_exp!) {
      trhatden(where:$where, order_by:{denno: asc}) {
        denno day scode vcode tcode updated_at updated_by
        trhatmeis(where:{line:{_eq:1}}){ gcode }
      }
    }`;
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new ComponentPortal(MatSpinner));
    }
    this.querySub?.unsubscribe();
    this.querySub = this.apollo.watchQuery<HatdenResult>({
      query: GetTran,
      variables: varWh,
      fetchPolicy: 'network-only'
    })
      .valueChanges
      .subscribe(({ data, error }) => {
        if (!data) {
          if (error) {
            const msg = String((error as Error).message ?? error);
            console.log('error query get_hatden', error);
            if (fax && /ofax_at|refax_at|sfax_at/.test(msg)) {
              // FAX の流れの列が読めない環境では、列を除いて検索し直す（FAX状況の絞り込みも外す）
              this.ffax = '';
              varWh.where._and = varWh.where._and.filter(c => !JSON.stringify(c).match(/ofax_at|refax_at|sfax_at/));
              this.runQuery(varWh, false);
              return;
            }
            this.overlayRef.detach();
            this.usrsrv.toastErr('発注伝票を検索できませんでした', msg);
            this.cdRef.detectChanges();
          }
          return;
        }
        const result = data as HatdenResult;
        if (result.trhatden.length == 0) {
          this.usrsrv.toastWar("条件に合うデータが見つかりませんでした");
        } else {
          let srcdata: Hatden[] = [];
          result.trhatden.forEach(element => {
            let { trhatmeis, ...rest } = element;
            let gcd = { gcode: trhatmeis[0]?.gcode ?? '' };
            srcdata.push({ ...rest, ...gcd, fax: faxLabel(rest) });
          });
          this.dataSource = new MatTableDataSource<Hatden>(srcdata);
          this.dataSource.paginator = this.paginator() ?? null;
        }
        this.overlayRef.detach();
        this.cdRef.detectChanges();
      }, (error) => {
        console.log('error query get_hatden', error);
        this.overlayRef.detach();
      });
  }
  sel_dno(selected: Hatden) {
    this.dialogRef.close(selected);
  }

  close() {
    this.dialogRef.close();
  }
}
