import { Component, OnInit, AfterViewInit, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, viewChild, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { ClearttblComponent } from './clearttbl.component';
import { Seikyu, SeisubSet, ClearService } from './clear.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { MembsService } from './../mstmember/membs.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { SeikyuhelpComponent } from './../share/seikyuhelp/seikyuhelp.component';
import { NdnohelpComponent } from './../share/ndnohelp/ndnohelp.component';
import { BeforeunloadBase } from '../beforeunload-base';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { TmstmpComponent } from '../core/tmstmp/tmstmp.component';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { ClearhisttblComponent } from './clearhisttbl.component';
import { TabDirective } from '../core/directives/tabidx/tab.directive';
import { DecimalPipe, DatePipe } from '@angular/common';
import { JdatePipe } from '../core/pipes/jdate.pipe';
import { McdtxtPipe } from '../core/pipes/mcdtxt.pipe';
import { ModetxtPipe } from '../core/pipes/modetxt.pipe';

/** 請求入金入力フォーム の項目名（明細の mtbl は除く） */
type ClearField = 'day' | 'scde' | 'code' | 'tcode' | 'memo' | 'nmoneysum' | 'smoneysum' | 'tmoneysum' | 'totalmoney' | 'idenno' | 'sdenno';

@Component({
    selector: 'app-frmclear',
    templateUrl: './frmclear.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatButton, MatIcon, MatTooltip, MatFormField, MatLabel, MatInput, FormsModule, MatIconButton, MatSuffix, ReactiveFormsModule, MatCard, MatCardHeader, MatCardTitle, TmstmpComponent, MatCardContent, MatSelect, MatOption, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, ClearhisttblComponent, TabDirective, ClearttblComponent, DecimalPipe, DatePipe, JdatePipe, McdtxtPipe, ModetxtPipe]
})
export class FrmclearComponent extends BeforeunloadBase implements OnInit, AfterViewInit {
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  stfsrv = inject(StaffService);
  memsrv = inject(MembsService);
  clrsrv = inject(ClearService);
  private fb = inject(FormBuilder);
  private title = inject(Title);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private elementRef = inject(ElementRef);
  private dialog = inject(MatDialog);
  private cdRef = inject(ChangeDetectorRef);

  readonly clearttbl = viewChild.required(ClearttblComponent);
  form!: FormGroup;
  /** フォームの項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
  private get ctl(): Record<ClearField, AbstractControl> {
    return this.form.controls as Record<ClearField, AbstractControl>;
  }
  denno: number = 0;
  rows: FormArray = this.fb.array([]);
  seikyu: Seikyu = new Seikyu();
  constructor() {
    super();
    const title = this.title;

    title.setTitle('請求入金伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      day: new FormControl(''),
      scde: new FormControl(''),
      code: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      memo: new FormControl(''),
      nmoneysum: new FormControl(''),
      smoneysum: new FormControl(''),
      tmoneysum: new FormControl(''),
      totalmoney: new FormControl(''),
      idenno: new FormControl(''),
      sdenno: new FormControl(''),
      mtbl: this.rows
    });
    this.bunsrv.getBunrui();
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.memsrv.getMembers().then(result => {
      this.route.paramMap.subscribe((params: ParamMap) => {
        if (params.get('mode') === null) {
          this.cancel();
        } else {
          this.clrsrv.mode = Number(params.get('mode'));
          this.refresh();
        }
        if (params.get('denno') !== null) {
          this.denno = Number(params.get('denno'));
          this.getNyuden(this.denno);
        }
      });
    });
    this.clrsrv.observeD.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }

  getNyuden(denno: number) {
    this.clrsrv.qryNyuden(denno).subscribe(
      result => {
        if (result == null) {
          this.usrsrv.toastInf("請求入金伝票番号" + denno + "は登録されていません");
          history.replaceState('', '', './frmclear');
        } else {
          this.ctl.idenno.setValue(+result.idenno);
          this.getSeikyu(result.idenno);
          this.clrsrv.nyuden = [];
          for (let i = 0; i < result.trnyudens.length; i++) {
            this.clrsrv.nyuden.push(
              {
                line: result.trnyudens[i].line,
                ptype: result.trnyudens[i].ptype,
                nmoney: result.trnyudens[i].nmoney,
                smoney: result.trnyudens[i].smoney,
                tmoney: result.trnyudens[i].tmoney,
                total: result.trnyudens[i].nmoney - result.trnyudens[i].smoney + result.trnyudens[i].tmoney,
                mmemo: result.trnyudens[i].mmemo
              }
            );
          }
          this.clearttbl().setTbl();
          this.ctl.day.setValue(result.day);
          this.ctl.code.setValue(result.code);
          this.ctl.tcode.setValue(result.tcode);
          this.refresh();
        }

      }, error => {
        console.log(error);
      }
    );
  }

  getSeikyu(denno: number | string) { // 入力欄からは文字列が渡される
    this.clrsrv.qrySeikyu(denno).subscribe(
      result => {
        this.ctl.idenno.setValue(denno);
        this.seikyu = result;
        this.ctl.scde.setValue(this.seikyu.mcode);
        this.ctl.code.setValue(this.seikyu.mcode);
        this.clrsrv.qrySeihis(denno).subscribe(seihis => {
          this.clrsrv.subHis.next(seihis.filter(e => e.denno !== this.denno));
        });
      }, error => {
        this.usrsrv.toastWar(error);
        console.log(error);
      }
    );
  }

  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }
  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.form.reset();
    this.getNyuden(this.denno);
  }


  refresh(): void {
    if (this.clrsrv.mode == 3) {
      this.form.disable();
      this.usrsrv.disableMtbl(this.form);
    } else {
      this.form.enable();
      this.usrsrv.enableMtbl(this.form);
    }
    this.cdRef.detectChanges();
  }
  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      mcode: this.form.value.scde,
      ftype: '1'
    };
    let dialogRef = this.dialog.open(NdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.denno = data.denno;
          this.getNyuden(this.denno);
        }
      }
    );
  }

  idennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(SeikyuhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.ctl.idenno.setValue(data.denno);
          this.getSeikyu(data.denno);
        }
      }
    );

  }
  mcdHelp(fldnm: ClearField): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.ctl[fldnm].setValue(data.mcode);
        }
      }
    );
  }
  modeToCre(): void {
    this.clrsrv.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.seikyu = new Seikyu();
    this.clrsrv.subHis.next([]);
    this.clearttbl().frmArr.clear();
    this.clearttbl().insRow(1);
    this.refresh();
  }
  modeToUpd(): void {
    this.clrsrv.mode = 2;
    this.refresh();
    history.replaceState('', '', './frmclear/' + this.clrsrv.mode + '/' + this.denno);
  }
  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.clrsrv.mode = 3;
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmclear/' + this.clrsrv.mode + '/' + this.denno);
    }
  }
  async save() {
    let head: SeisubSet = {
      day: this.usrsrv.editFrmval(this.form, 'day'),
      mcode: this.usrsrv.editFrmval(this.form, 'scde'),
      code: this.usrsrv.editFrmval(this.form, 'code'),
      idenno: this.usrsrv.editFrmval(this.form, 'idenno'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code
    }

    if (this.clrsrv.mode == 2) {
      let dept = this.clearttbl().getMtbl(this.denno);
      this.clrsrv.updNyuden(this.denno, head, dept)
        .then(result => {
          this.usrsrv.toastSuc('請求入金伝票' + this.denno + 'の変更を保存しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '請求入金伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_seinyu', error);
        });


    } else {//新規登録
      this.denno = await this.usrsrv.getNumber('ndenno', 1, this.denno);
      let dept = this.clearttbl().getMtbl(this.denno);
      const trnyusub = [{
        ...{
          id: this.usrsrv.compid,
          kubun: 1,
          denno: this.denno,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code,
        }
        , ...head
      }]
      this.clrsrv.insNyuden(trnyusub, dept)
        .then(result => {
          this.usrsrv.toastSuc('請求入金伝票' + this.denno + 'を新規登録しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '請求入金伝票の新規登録ができませんでした');
          console.log('error insert_seinyu', error);
        });
    }

  }
  getInvalid(): string {
    let tooltip: string = "";
    const ctrls0 = this.form.controls;
    for (const name in ctrls0) {
      if (ctrls0[name].invalid) {
        if (name == 'mtbl') {
          for (let i = 0; i < this.frmArr.length; i++) {
            const ctrls = (this.frmArr.at(i) as FormGroup).controls
            for (const nam in ctrls) {
              if (ctrls[nam].invalid) {
                tooltip += this.usrsrv.getColtxt('trnyuden', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
              }
            }
          }

        } else {
          tooltip += this.usrsrv.getColtxt('trnyuden', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
        }
      }
    }
    return tooltip;
  }

}
