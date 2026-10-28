import { Component, OnInit, AfterViewInit, ElementRef, ViewEncapsulation, AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, NgZone, viewChild, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, AbstractControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';

import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';

import { JmeitblComponent } from './jmeitbl.component';
import { BeforeunloadBase } from '../beforeunload-base';
import { JyumeiService, JyudenSet, JyudenNew } from './jyumei.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { BunshoService } from './../services/bunsho.service';
import { OkuriService } from './../services/okuri.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { MembsService } from './../mstmember/membs.service';
import { DownloadService } from './../services/download.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { JdnohelpComponent } from './../share/jdnohelp/jdnohelp.component';
import { AdredaComponent } from './../share/adreda/adreda.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { SSTATUS } from './../frminvoice/invoice.service';
import { JDST, shipNote } from './../frmship/ship-forms';
import { ShipService } from './../frmship/ship.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatInput, MatSuffix, MatLabel, MatPrefix } from '@angular/material/input';
import { TabDirective } from '../core/directives/tabidx/tab.directive';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatCheckbox } from '@angular/material/checkbox';
import { TmstmpComponent } from '../core/tmstmp/tmstmp.component';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatExpansionPanel, MatExpansionPanelHeader } from '@angular/material/expansion';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { NuminputDirective } from '../core/directives/numinput.directive';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { JdatePipe } from '../core/pipes/jdate.pipe';
import { McdtxtPipe } from '../core/pipes/mcdtxt.pipe';
import { ModetxtPipe } from '../core/pipes/modetxt.pipe';

/** get_member クエリの結果 */
interface MemberResult { msmember_by_pk: mwI.Member | null }
/** 受注入力フォームの項目名（明細の mtbl は除く） */
type JyudenField = 'torikbn' | 'mcode' | 'scde' | 'ncode' | 'nsaki' | 'nadr' | 'buntype' | 'day' | 'yday' | 'sday' | 'uday' | 'nday' | 'tcode' | 'scode' | 'skbn' | 'jcode' | 'pcode' | 'hcode' | 'hday' | 'htime' | 'okurisuu' | 'okurino' | 'dmemo' | 'nmemo' | 'smemo' | 'omemo' | 'cusden' | 'ryoate' | 'daibiki' | 'daibzei' | 'daibunrui' | 'chubunrui' | 'shobunrui' | 'tcode1' | 'gtotalzn' | 'soryozn' | 'tesuzn' | 'nebikizn' | 'taxtotal' | 'total' | 'genka' | 'hgenka' | 'egenka' | 'isaki' | 'iadr' | 'total8' | 'total10' | 'dokono' | 'eidome' | 'eicode';
@Component({
    selector: 'app-frmsales',
    templateUrl: './frmsales.component.html',
    styleUrls: ['./../app.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatButton, MatIcon, MatTooltip, MatFormField, MatInput, FormsModule, TabDirective, MatIconButton, MatSuffix, MatMenuTrigger, MatMenu, MatMenuItem, ReactiveFormsModule, MatCheckbox, TmstmpComponent, MatLabel, MatSelect, MatOption, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, MatPrefix, MatExpansionPanel, MatExpansionPanelHeader, MatCard, MatCardHeader, MatCardTitle, NuminputDirective, MatCardContent, JmeitblComponent, DecimalPipe, PercentPipe, JdatePipe, McdtxtPipe, ModetxtPipe]
})
export class FrmsalesComponent extends BeforeunloadBase implements OnInit, AfterViewInit {
  usrsrv = inject(UserService);
  private fb = inject(FormBuilder);
  private title = inject(Title);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private elementRef = inject(ElementRef);
  private dialog = inject(MatDialog);
  bunsrv = inject(BunruiService);
  bnssrv = inject(BunshoService);
  stfsrv = inject(StaffService);
  okrsrv = inject(OkuriService);
  memsrv = inject(MembsService);
  strsrv = inject(StoreService);
  jmisrv = inject(JyumeiService);
  private dwlsrv = inject(DownloadService);
  private shipsrv = inject(ShipService);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);
  private cdRef = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  readonly jmeitbl = viewChild.required(JmeitblComponent);
  form!: FormGroup;
  /** フォームの項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
  private get ctl(): Record<JyudenField, AbstractControl> {
    return this.form.controls as Record<JyudenField, AbstractControl>;
  }
  mode: number = 3;
  vnyuzan!: mwI.Vnyuzan;
  /** 計上先の請求伝票番号。請求済（null 以外）の伝票は編集・取消できない */
  idenno: number | null = null;
  /** 計上先の請求伝票の送付の進捗（例: 営業OK）。請求済でないときは空 */
  istatus: string = '';
  /** 受注ステータス（分類マスタ jdstatus。出荷指示フォルダ作成済など） */
  jdstatus: string = '';
  /** キープ表を送るよう促すときの理由（受注可能数が少ない商品など）。空なら促さない */
  keepSuggest: string = '';
  keepBusy = false;
  readonly JDST = JDST;
  /** 表示中の伝票番号（別の伝票を開いたら、キープ表の案内を消す） */
  private shownDenno = 0;
  hktval: mwI.Sval[] = [];
  rows: FormArray = this.fb.array([]);
  getden!: number;
  gdsttl: number = 0;
  proc: mwI.Proc[] = [];
  nskVal: mwI.Sval[] = [];
  iskVal: mwI.Sval[] = [];
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  private jyudenSub?: Subscription;
  private memberSub?: Subscription;
  constructor() {
    super();
    const title = this.title;

    title.setTitle('受注伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.form = this.fb.group({
      // jdstatus: new FormControl(''),
      torikbn: new FormControl(''),
      mcode: new FormControl(''),
      scde: new FormControl(''),
      ncode: new FormControl(''),
      nsaki: new FormControl(''),
      nadr: new FormControl(''),
      buntype: new FormControl(''),
      day: new FormControl(''),
      yday: new FormControl(''),
      sday: new FormControl(''),
      uday: new FormControl(''),
      nday: new FormControl(''),
      tcode: new FormControl(''),
      scode: new FormControl(''),
      skbn: new FormControl('', Validators.required),
      jcode: new FormControl('', Validators.required),
      pcode: new FormControl('', Validators.required),
      hcode: new FormControl(''),
      hday: new FormControl(''),
      htime: new FormControl(''),
      okurisuu: new FormControl(''),
      okurino: new FormControl(''),
      dmemo: new FormControl(''),
      nmemo: new FormControl(''),
      smemo: new FormControl(''),
      omemo: new FormControl(''),
      cusden: new FormControl(''),
      ryoate: new FormControl(''),
      daibiki: new FormControl(''),
      daibzei: new FormControl(''),
      daibunrui: new FormControl(''),
      chubunrui: new FormControl(''),
      shobunrui: new FormControl(''),
      tcode1: new FormControl(''),
      gtotalzn: new FormControl(''),
      soryozn: new FormControl(''),
      tesuzn: new FormControl(''),
      nebikizn: new FormControl(''),
      taxtotal: new FormControl(''),
      total: new FormControl(''),
      genka: new FormControl(''),
      hgenka: new FormControl(''),
      egenka: new FormControl(''),
      isaki: new FormControl(''),
      iadr: new FormControl(''),
      total8: new FormControl(''),
      total10: new FormControl(''),
      dokono: new FormControl(''),
      eidome: new FormControl(''),
      eicode: new FormControl(''),
      mtbl: this.rows
    });
    this.bnssrv.getBuntype();
    this.bnssrv.getBunsho();
    this.okrsrv.getHaisou();
    this.okrsrv.getHokuri();
    this.okrsrv.getHktime();
    this.strsrv.getStore();
    this.bunsrv.getBunrui();
	// console.log('納品書タイプ',this.bnssrv.buntype);
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.memsrv.getMembers().then(result => {
      this.route.paramMap.subscribe((params: ParamMap) => {
        if (params.get('mode') === null) {
          this.cancel();
        } else {
          this.mode = Number(params.get('mode'));
          this.refresh();
        }
        if (params.get('denno') !== null) {
          this.jmisrv.denno = Number(params.get('denno'));
          this.getJyuden(this.jmisrv.denno);
        }
      });
      this.jmisrv.observe.subscribe(flg => {
        this.cdRef.detectChanges();
      });
    });
	console.log('納品書タイプ',this.bnssrv.buntype);
  }
  selHcd(value: string) {
    const i: number = this.okrsrv.hokuri.findIndex(obj => obj.code == value);
    if (i > -1) {
      this.hktval = [];
      for (let j = 0; j < this.okrsrv.hktime.length; j++) {
        if (this.okrsrv.hktime[j].hscode == this.okrsrv.hokuri[i].hscode) {
          let sval: mwI.Sval = { value: this.okrsrv.hktime[j].code, viewval: this.okrsrv.hktime[j].name };
          this.hktval.push(sval);
        }
      }
    } else {
      this.hktval = [];
    }
  }

  selBetsu(value: string) {
    if (value == "2") {
      console.log(this.form.get('nadr'));
      this.ctl.nadr.setValue('');
      this.ctl.nadr.enable();
      this.ctl.buntype.setValue(this.jmisrv.tntype);
    } else {
      this.ctl.nadr.setValue(+value);
      this.ctl.nadr.disable();
      this.ctl.buntype.setValue(this.jmisrv.ntype);
      this.changeEda(+value);
    }
  }

  selIrai(value: string) {
    if (value == " ") {
      this.ctl.iadr.reset();
      this.ctl.iadr.disable();
      this.changeIadr(null);
    } else if (value == "2") {
      // console.log(this.form.get('nadr'));
      this.ctl.iadr.setValue('');
      this.ctl.iadr.enable();
      this.changeIadr(null);
    } else {
      this.ctl.iadr.setValue(+value);
      this.ctl.iadr.disable();
      this.changeIadr(+value);
    }
  }

  makeFrmShip(typ: string) {
    // console.log(typ);
    if (this.okrsrv.getHinfo(this.form.value.hcode).numbering && !this.form.value.okurino) {
      this.setOkrno().then(() => {
        this.save().then(() => {
          if (typ == 'BUNTY') {
            let i: number = this.bnssrv.buntype.findIndex(obj => obj.code == this.form.value.buntype);
            if (i > -1) {
              this.dwlsrv.dlKick(this.usrsrv.system.urischema + 'FRM-SHIP_' + this.usrsrv.compid + "-" + this.jmisrv.denno + "-" + this.bnssrv.buntype[i].first + this.bnssrv.buntype[i].saki + this.bnssrv.buntype[i].second + this.bnssrv.buntype[i].sksec + 'S', this.elementRef);
            } else {
              this.usrsrv.toastInf("文書タイプが登録されていません");
            }
          } else {
            this.dwlsrv.dlKick(this.usrsrv.system.urischema + 'FRM-SHIP_' + this.usrsrv.compid + "-" + this.jmisrv.denno + "-" + typ, this.elementRef);
          }
        })
      });
    } else {
      this.save().then(() => {
        if (typ == 'BUNTY') {
          let i: number = this.bnssrv.buntype.findIndex(obj => obj.code == this.form.value.buntype);
          if (i > -1) {
            this.dwlsrv.dlKick(this.usrsrv.system.urischema + 'FRM-SHIP_' + this.usrsrv.compid + "-" + this.jmisrv.denno + "-" + this.bnssrv.buntype[i].first + this.bnssrv.buntype[i].saki + this.bnssrv.buntype[i].second + this.bnssrv.buntype[i].sksec + 'S', this.elementRef);
          } else {
            this.usrsrv.toastInf("文書タイプが登録されていません");
          }
        } else {
          this.dwlsrv.dlKick(this.usrsrv.system.urischema + 'FRM-SHIP_' + this.usrsrv.compid + "-" + this.jmisrv.denno + "-" + typ, this.elementRef);
        }
      })
    }
  }

  /** 出荷指示: 受注一覧（出荷指示）をこの伝票だけで開く（編集中なら先に保存する） */
  async shipOne() {
    if (this.mode == 2 && !(await this.save())) {
      return;
    }
    this.usrsrv.openMst('frmship', String(this.jmisrv.denno));
  }

  getRows(fldnm: JyudenField): number {
    const lines: number = (this.ctl[fldnm].value + '\n').split('\n').length - 1;
    return lines;
  }

  /**
   * キープ表: 倉庫宛 FAX フォルダ（NAS）に保存し、受注ステータスを「キープ表FAX済」にする
   * （倉庫のマクロが印刷し、倉庫のスマホでキープ表の QR を読んで確保数を入れる）
   */
  async makeFrmKeep() {
    if (!this.jmisrv.denno) {
      return;
    }
    this.keepBusy = true;
    this.cdRef.detectChanges();
    try {
      const file = await this.shipsrv.keepFax(this.jmisrv.denno);
      this.keepSuggest = '';
      this.usrsrv.toastSuc('キープ表を倉庫宛FAXフォルダに保存しました（' + file + '）');
      this.getJyuden(this.jmisrv.denno);
    } catch (e) {
      this.usrsrv.toastErr('キープ表を保存できませんでした', (e as Error).message);
      console.log('error makeFrmKeep', e);
    }
    this.keepBusy = false;
    this.cdRef.detectChanges();
  }

  /** 受注可能数が 10 未満の実物の商品（キープ表を送るよう促すため）。保存の前に、入力中の明細から調べる */
  private lowStock(): string[] {
    const mcode = this.form.value.mcode ?? '';
    return (this.frmArr.getRawValue() as { gcode: string; gtext: string; suu: number; pable: number | null }[])
      .filter(r => r.gcode && r.pable != null && Number(r.pable) < 10 && Number(r.suu) > 0 && shipNote(r.gcode, r.gtext ?? '', mcode).check)
      .map(r => r.gcode + '（' + r.pable + '）');
  }

  openOkuri(hcode: string, value: string) {
    window.open(this.okrsrv.getUrl(hcode) + value, '_blank');
  }

  /** 受注伝票の操作ログ（登録・変更・取消・請求計上など）を表示する */
  opelog() {
    if (!this.jmisrv.denno) {
      return;
    }
    const data: OpelogParam = { extype: '1', keycode: String(this.jmisrv.denno), title: '受注伝票 ' + this.jmisrv.denno, table: 'trjyuden' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data: data });
  }

  /** 計上先の請求伝票の送付の進捗を取得する */
  private async getIstatus(idenno: number | null) {
    this.istatus = '';
    if (!idenno || idenno <= 0) {
      return;
    }
    const GetStatus = gql`
      query get_istatus($id: smallint!, $dno: Int!) {
        trseikyu(where: {id: {_eq: $id}, denno: {_eq: $dno}}) {
          sstatus
          del
        }
      }`;
    try {
      const { data } = await firstValueFrom(this.apollo.query<{ trseikyu: { sstatus: number; del: boolean }[] }>({
        query: GetStatus, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno: idenno }
      }));
      const s = (data as { trseikyu: { sstatus: number; del: boolean }[] }).trseikyu[0];
      this.istatus = s ? (s.del ? '取消済' : SSTATUS[s.sstatus] ?? '') : '';
    } catch (error) {
      console.log('error query get_istatus', error);
    }
    this.cdRef.detectChanges();
  }

  test() {
    // this.usrsrv.toastInf(this.form.value.yday);
    // console.log(value);
    // console.log(!this.form.value.sday, this.form.value.sday);
    // console.log(!this.form.value.buntype, this.form.value.buntype);
    // console.log(!this.form.value.hcode, this.form.value.hcode);
    // // this.router.navigate(['/mstmember','3',value]);
    // const url = this.router.createUrlTree(['/mstmember','3',value]);
    // window.open(url.toString(),null,'top=100,left=100');
  }

  onEnter() {
    this.jmisrv.denno = this.usrsrv.convNumber(this.jmisrv.denno);
    this.getJyuden(this.jmisrv.denno);
  }

  refresh(): void {
    if (this.mode == 3 || this.mode == 4) {
      this.form.disable();
      this.usrsrv.disableMtbl(this.form);
    } else {
      this.form.enable();
      this.usrsrv.enableMtbl(this.form);
    }
  }

  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }

  getJyuden(denno: number): void {
    if (this.jmisrv.denno > 0) {
      if (!this.overlayRef.hasAttached()) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.jyudenSub?.unsubscribe();
      this.jyudenSub = this.jmisrv.qryJyuden(denno).subscribe(
        result => {
          this.form.reset();
          this.jmisrv.trzaiko = [];
          this.idenno = result?.idenno ?? null;
          if (denno != this.shownDenno) {
            this.keepSuggest = '';
          }
          this.shownDenno = denno;
          this.jdstatus = result?.jdstatus ?? '';
          if (this.jdstatus == JDST.KEEP_CHANGED) {
            this.keepSuggest = 'キープ表のFAX後に明細が変わりました。キープ表を送り直してください';
          }
          this.getIstatus(this.idenno);
          if (result == null) {
            this.usrsrv.toastInf("受注伝票番号" + denno + "は登録されていません");
            history.replaceState('', '', './frmsales');
          } else {
            let jyuden: mwI.Trjyuden = result;
            if (jyuden.nadr > 1) {
              this.ctl.nsaki.setValue("2");
            } else {
              this.ctl.nsaki.setValue(jyuden.nadr.toString());
            }
            if (jyuden.iadr == null) {
              this.ctl.isaki.setValue(" ");
            } else if (jyuden.iadr > 1) {
              this.ctl.isaki.setValue("2");
            } else {
              this.ctl.isaki.setValue(jyuden.nadr.toString());
            }
            this.form.patchValue(jyuden);
            this.jmeitbl().setJyumei(jyuden);
            this.usrsrv.setTmstmp(jyuden);
            this.jmisrv.denno = denno;
			this.vnyuzan = jyuden.vnyuzan;
            this.getMember(jyuden.mcode, false);
            if (jyuden.del == true) {
              this.mode = 4;
            } else {
              this.mode = 3;
            }
            history.replaceState('', '', './frmsales/' + this.mode + '/' + this.jmisrv.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query GetJyuden', error);
          this.usrsrv.toastInf("受注伝票読込エラー");
          this.form.reset();
          history.replaceState('', '', './frmsales');
          this.overlayRef.detach();
        }
      );
    } else {
      this.form.reset();
      this.jmeitbl().frmArr.clear();
      this.jmeitbl().addRows(1);
      this.overlayRef.detach();
    }
    this.cdRef.detectChanges();
  }

  mcdHelp(fldnm: JyudenField): void {
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

  dennoHelp(flg?: boolean) {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    if (flg) {
      dialogConfig.data = {
        mcode: this.form.value.ncode,
        mcdfld: 'ncode'
      };
    }
    let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          if (flg) {
            this.ctl.dokono.setValue(data.denno);
            this.ctl.okurino.setValue(data.okurino);
          } else {
            this.jmisrv.denno = data.denno;
            this.getJyuden(this.jmisrv.denno);
          }
        }
      }
    );

  }
  changeMcd() {
    let lcmcode: string = "";
    if (this.form.value.mcode != null) {
      lcmcode = this.usrsrv.convUpper(this.form.value.mcode);
    } else {
      lcmcode = "";
    }
    this.getMember(lcmcode, true);	
    this.ctl.mcode.setValue(lcmcode);
	if (this.form.value.scde == null) {
	　 this.ctl.scde.setValue(lcmcode);      
	}  
    if (this.form.value.ncode == null) {
      this.ctl.ncode.setValue(lcmcode);
	}
	// console.log(this.form.value);
  }

  changeEda(eda: string | number | null) { // 入力欄からは文字列が渡される
    if (eda !== null) {
      let i: number = this.memsrv.adrs.findIndex(obj => obj.eda == eda);
      if (i > -1) {
        this.ctl.nadr.setErrors(null);
        const adr = this.memsrv.adrs[i];
        this.ctl.nmemo.setValue(adr.nmemo);
        this.ctl.smemo.setValue(adr.smemo);
        this.ctl.omemo.setValue(adr.omemo);
		// console.log('changeeda',adr.street ,adr.extend,(adr.extend ?? ''));
        this.jmisrv.address = adr.zip + '\n' + adr.region + adr.local + '\n' + (adr.street ?? '') + '\n' + (adr.extend ?? '') + (adr.extend2 ?? '') + '\n' + adr.adrname + '\n' + adr.tel;
      } else {
        this.usrsrv.toastInf("別納品先枝番" + eda + "は登録されていません");
        this.ctl.nadr.setErrors({ 'incorrect': true });
      }
    }
  }

  changeSday() {
//	if (this.form.value.sday != null) {  
//		this.form.get('uday').setValue(this.form.value.sday);
//		if (this.form.value.torikbn == false) {
//		  this.form.get('nday').setValue(this.usrsrv.getNextMonth(this.form.value.sday));
//		}
//	}
	
  }

  changeIadr(eda: string | number | null) {
    if (eda !== null) {
      let i: number = this.memsrv.adrs.findIndex(obj => obj.eda == eda);
      if (i > -1) {
        this.ctl.iadr.setErrors(null);
        const adr = this.memsrv.adrs[i];
        this.jmisrv.iaddress = adr.zip + '\n' + adr.region + adr.local + '\n' + (adr.street ?? '') + '\n' + (adr.extend ?? '') + (adr.extend2 ?? '') + '\n' + adr.adrname + '\n' + adr.tel;
      } else {
        this.usrsrv.toastInf("依頼主枝番" + eda + "は登録されていません");
        this.ctl.iadr.setErrors({ 'incorrect': true });
      }
    } else {
      this.jmisrv.iaddress = "";
    }
  }
  async setOkrno() {
    let okrno: string = await this.okrsrv.setOkurino(this.form.value.hcode);
    // console.log(okrno);
    if (this.usrsrv.compid == 1 && this.form.value.mcode == 408223) {
      okrno = await this.jmisrv.checkAmazon(this.form.value.hcode, okrno);
    }
    this.ctl.okurino.setValue(okrno);
  }

  getMember(mcode: string, flg: boolean) {//flg:true⇒画面変更時、false⇒受注伝票読込時
    this.memberSub?.unsubscribe();
    this.memberSub = this.apollo.watchQuery<MemberResult>({
      query: Query.GetMember,
      variables: {
        id: this.usrsrv.compid,
        mcode: mcode
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        if (!data) {
          return;
        }
        const msmember = (data as MemberResult).msmember_by_pk;
        if (msmember == null) {
          this.usrsrv.toastInf("顧客コード" + mcode + "は登録されていません");
        } else {
          let member: mwI.Member = msmember;
          if (flg) {
            // console.log(member, member.gadr);
            this.form.patchValue(member);
            this.ctl.nsaki.setValue(member.gadr);
            if (member.gadr == "0" || member.gadr == "1") {
              this.ctl.nadr.setValue(member.gadr);
              this.ctl.buntype.setValue(member.ntype);
            } else if (member.gadr == "2") {
              this.ctl.buntype.setValue(member.tntype);
            }
            this.selHcd(member.hcode);
            let i: number = this.okrsrv.hokuri.findIndex(obj => obj.code == member.hcode);
            if (i > -1) {
              // console.log(this.okrsrv.hokuri[i].hscode, member.htime);
              let k: number = this.okrsrv.hktime.findIndex(obj => obj.hscode == this.okrsrv.hokuri[i].hscode && obj.bunrui == member.htime);
              if (k > -1) {
                this.ctl.htime.setValue(this.okrsrv.hktime[k].code);
              }
            }
          }
          this.jmisrv.mtax = member.mtax;
          this.jmisrv.tankakbn = member.tankakbn;
          this.jmisrv.sptnkbn = member.sptnkbn ?? "";
          this.jmisrv.ntype = member.ntype;
          this.jmisrv.tntype = member.tntype;
          this.proc = member.msprocesses;
          let msmadrs: mwI.Adrs[] = member.msmadrs;
          this.memsrv.mcode = mcode;
          this.memsrv.edas = [];
          this.memsrv.adrs = [];
		  this.jmisrv.dmemo = member.dmemo;
		  this.ctl.dmemo.setValue("");
          this.nskVal = [];
          this.nskVal.push({ value: "0", viewval: "基本住所" });
          for (let j = 0; j < msmadrs.length; j++) {
            this.memsrv.adrs.push(msmadrs[j]);
            if (msmadrs[j].eda == 1) {
              this.nskVal.push({ value: "1", viewval: "その他住所" });
            }
            if (msmadrs[j].eda > 1) {
              this.memsrv.edas.push({
                eda: msmadrs[j].eda,
                zip: msmadrs[j].zip,
                region: msmadrs[j].region,
                local: msmadrs[j].local,
                street: msmadrs[j].street,
                extend: msmadrs[j].extend,
                extend2: msmadrs[j].extend2,
                adrname: msmadrs[j].adrname,
                tel: this.usrsrv.setTel(msmadrs[j].tel, msmadrs[j].tel2, msmadrs[j].tel3, msmadrs[j].fax)
              });
            }
          }
          this.nskVal.push({ value: "2", viewval: "別納" });
          this.iskVal = this.nskVal.concat();
          this.iskVal.unshift({ value: " ", viewval: "通常依頼主" });
          // console.log("getMember changeeda call",this.form.value);
          this.changeEda(this.form.value.nadr);
          this.cdRef.detectChanges();
        }
      }, (error) => {
        console.log('error query get_member', error);
      });
  }

  diaBetsu(adrnm: JyudenField): void {
    let ncd: string = this.form.value.ncode;
    let flg: boolean = false;
    if (this.mode < 3) {
      flg = true;
    }
    if (this.checkMcode(ncd)) {
      let dialogConfig = new MatDialogConfig();
      dialogConfig.autoFocus = true;
      dialogConfig.data = {
        mcode: ncd + ' ' + this.memsrv.getMcdtxt(ncd),
        // mode: this.mode,
        eda: this.form.value.nadr,
        flg: flg
      };
      // console.log(dialogConfig.data);
      let dialogRef = this.dialog.open(AdredaComponent, dialogConfig);
      dialogRef.afterClosed().subscribe(
        data => {
          // console.log(data);
          if (typeof data != 'undefined' && this.mode != 3) {

            this.ctl[adrnm].setValue(data);
            if (adrnm === 'nadr') {
              this.changeEda(data);
            } else {
              this.changeIadr(data);
            }
          }
        }
      );
    }
  }

  checkMcode(mcode: number | string): boolean {
    let flg: boolean;
    let i: number = this.memsrv.membs.findIndex(obj => obj.mcode == mcode);
    if (i > -1) {
      flg = true;
    } else {
      flg = false;
    }
    return flg;
  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.jmisrv.denno = 0;
    this.idenno = null;
    this.istatus = '';
    this.ctl.tcode.setValue(this.usrsrv.staff.code);
    this.ctl.day.setValue(new Date());
    this.ctl.yday.setValue(this.usrsrv.getNextday(new Date()));
    // this.form.get('scode').setValue(this.usrsrv.staff.scode);
    this.ctl.skbn.setValue("0");
    this.jmeitbl().frmArr.clear();
	this.jmisrv.isSaving = false;
    this.refresh();
    this.jmeitbl().addRows(1);
  }

  modeToUpd(): void {
    if (this.idenno) {
      this.usrsrv.toastWar('受注伝票' + this.jmisrv.denno + 'は請求済（請求伝票' + this.idenno + '）のため編集できません');
      return;
    }
    this.mode = 2;
	this.jmisrv.isSaving = false;
    this.refresh();
    history.replaceState('', '', './frmsales/' + this.mode + '/' + this.jmisrv.denno);
  }

  modeToDel(flg: boolean, mode: number): void {
    let lctxt: string = (flg ? '取消' : '取消解除');
    if (this.idenno) {
      this.usrsrv.toastWar('受注伝票' + this.jmisrv.denno + 'は請求済（請求伝票' + this.idenno + '）のため' + lctxt + 'できません');
      return;
    }
    if (window.confirm(lctxt + 'してもよろしいですか？')) {
      this.jmisrv.delJyuden(this.jmisrv.denno, flg);
      this.mode = mode;
      this.refresh();
      history.replaceState('', '', './frmsales/' + this.mode + '/' + this.jmisrv.denno);
    }
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode = 3;
      this.getJyuden(this.jmisrv.denno);
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmsales/' + this.mode + '/' + this.jmisrv.denno);
    }
  }
  getInvalid(): string {
    let tooltip: string = "";
    const ctrls0 = this.form.controls;
    for (const name in ctrls0) {
      if (name == 'yday') {

        if (ctrls0[name].errors?.matDatepickerFilter) {
          ctrls0[name].setErrors(null);
        }
      }
      if (ctrls0[name].invalid) {
        if (name == 'mtbl') {
          for (let i = 0; i < this.frmArr.length; i++) {
            const ctrls = (this.frmArr.at(i) as FormGroup).controls;
            for (const nam in ctrls) {
              if (ctrls[nam].invalid) {
                tooltip += this.usrsrv.getColtxt('trjyumei', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
              }
            }
          }

        } else {
          // console.log(name);  
          tooltip += this.usrsrv.getColtxt('trjyuden', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
        }
      }
    }
    // console.log(tooltip,this.form.invalid);
    return tooltip;
  }

  async save(): Promise<boolean> {
	this.jmisrv.isSaving = true;  
    // console.log(Boolean(this.usrsrv.editFrmval(this.form, 'torikbn')), this.usrsrv.editFrmval(this.form, 'iadr'),);
    // console.log(this.form.get('iadr'), this.usrsrv.editFrmval(this.form, 'iadr'));
    let jyuden: JyudenSet = {
      torikbn: Boolean(this.usrsrv.editFrmval(this.form, 'torikbn')),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code,
      mcode: this.usrsrv.editFrmval(this.form, 'mcode'),
      scde: this.usrsrv.editFrmval(this.form, 'scde'),
      ncode: this.usrsrv.editFrmval(this.form, 'ncode'),
      nadr: +this.usrsrv.editFrmval(this.form, 'nadr'),
      buntype: this.usrsrv.editFrmval(this.form, 'buntype'),
      day: this.usrsrv.editFrmday(this.form, 'day'),
      yday: this.usrsrv.editFrmday(this.form, 'yday'),
      sday: this.usrsrv.editFrmday(this.form, 'sday'),
      uday: this.usrsrv.editFrmday(this.form, 'uday'),
      nday: this.usrsrv.editFrmday(this.form, 'nday'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      scode: this.usrsrv.editFrmval(this.form, 'scode'),
      skbn: this.usrsrv.editFrmval(this.form, 'skbn'),
      jcode: this.usrsrv.editFrmval(this.form, 'jcode'),
      pcode: this.usrsrv.editFrmval(this.form, 'pcode'),
      hcode: this.usrsrv.editFrmval(this.form, 'hcode'),
      hday: this.usrsrv.editFrmday(this.form, 'hday'),
      htime: this.usrsrv.editFrmval(this.form, 'htime'),
      okurisuu: this.usrsrv.editFrmval(this.form, 'okurisuu'),
      okurino: this.usrsrv.editFrmval(this.form, 'okurino'),
      dmemo: this.usrsrv.editFrmval(this.form, 'dmemo'),
      nmemo: this.usrsrv.editFrmval(this.form, 'nmemo'),
      omemo: this.usrsrv.editFrmval(this.form, 'omemo'),
      smemo: this.usrsrv.editFrmval(this.form, 'smemo'),
      cusden: this.usrsrv.editFrmval(this.form, 'cusden'),
      ryoate: this.usrsrv.editFrmval(this.form, 'ryoate'),
      daibiki: this.usrsrv.editFrmval(this.form, 'daibiki'),
      daibzei: this.usrsrv.editFrmval(this.form, 'daibzei'),
      daibunrui: this.usrsrv.editFrmval(this.form, 'daibunrui'),
      chubunrui: this.usrsrv.editFrmval(this.form, 'chubunrui'),
      shobunrui: this.usrsrv.editFrmval(this.form, 'shobunrui'),
      tcode1: this.usrsrv.editFrmval(this.form, 'tcode1'),
      gtotalzn: this.usrsrv.editFrmval(this.form, 'gtotalzn'),
      soryozn: this.usrsrv.editFrmval(this.form, 'soryozn'),
      tesuzn: this.usrsrv.editFrmval(this.form, 'tesuzn'),
      nebikizn: this.usrsrv.editFrmval(this.form, 'nebikizn'),
      taxtotal: this.usrsrv.editFrmval(this.form, 'taxtotal'),
      total: this.usrsrv.editFrmval(this.form, 'total'),
      genka: this.usrsrv.editFrmval(this.form, 'genka'),
      hgenka: this.usrsrv.editFrmval(this.form, 'hgenka'),
      egenka: this.usrsrv.editFrmval(this.form, 'egenka'),
      iadr: +this.usrsrv.editFrmval(this.form, 'iadr'),
      total8: this.usrsrv.editFrmval(this.form, 'total8'),
      total10: this.usrsrv.editFrmval(this.form, 'total10'),
      dokono: this.usrsrv.editFrmval(this.form, 'dokono'),
      eidome: this.usrsrv.editFrmval(this.form, 'eidome'),
      eicode: this.usrsrv.editFrmval(this.form, 'eicode'),
      // 保存したら受注登録にする（出荷指示フォルダ作成後に直したときは、作り直し〈差替分〉の対象に戻る）
      jdstatus: JDST.TOROKU,
      del: false
    }
    console.log('save jyuden',jyuden);
    // 受注可能数が 10 未満の商品（保存後にキープ表を促す）。保存すると明細を読み直すので、先に調べる
    const low = this.lowStock();
    const suggest = (st: string) => {
      this.shownDenno = this.jmisrv.denno;
      if (st == JDST.KEEP_CHANGED) {
        this.keepSuggest = 'キープ表のFAX後に明細が変わりました。キープ表を送り直してください';
      } else if (st == JDST.TOROKU && low.length > 0) {
        this.keepSuggest = '受注可能数が 10 未満の商品があります：' + low.join('、') + '。キープ表を倉庫へ送ってください';
      } else {
        this.keepSuggest = '';
      }
    };
    if (this.mode == 2) {
      // キープ表の段階では、明細の追加・削除や数量の増減があれば「キープ表FAX後の変更」、無ければそのまま
      jyuden.jdstatus = await this.shipsrv.statusOnSave(this.jmisrv.denno, this.jdstatus,
        (this.frmArr.getRawValue() as { gcode: string; suu: number }[]).map(r => ({ gcode: r.gcode, suu: Number(r.suu) })));
    }
    if (this.mode == 2) {
      return new Promise(resolve => {
        // let jyumei=this.jmeitbl.get_jyumei(this.jmisrv.denno); 
        this.jmeitbl().editJyumei(this.jmisrv.denno);
        let jyumei = this.jmisrv.trjyumei;
        let jyumzai = this.jmisrv.trjmzai;
        console.log('save変更',jyumzai);
        this.jmisrv.updJyuden(this.jmisrv.denno, { ...jyuden }, jyumei, jyumzai)
          .then(result => {
            this.usrsrv.toastSuc('受注伝票' + this.jmisrv.denno + 'の変更を保存しました');
            //  zaiko更新処理 (読込時分マイナス)
            this.jmisrv.trzaiko.forEach(e => {
              this.jmisrv.updZaiko(e);
            });
            //  zaiko更新処理 (通常分プラス)
            if (jyuden.skbn != "1") {
              this.jmisrv.zaikoNew.forEach(z => this.jmisrv.updZaiko(z));
            }
            suggest(jyuden.jdstatus);
            this.form.markAsPristine();
            this.cancel();
            return resolve(true);
			this.jmisrv.isSaving = false;
          }).catch(error => {
            this.usrsrv.toastErr('データベースエラー', '受注伝票' + this.jmisrv.denno + 'の変更保存ができませんでした');
            console.log('error update_jyuen', error);
            return resolve(false);
			this.jmisrv.isSaving = false;
          });
      });
    } else if (this.mode == 1) {//新規登録
      // console.log('save新規',this.jmisrv.trjmzai);
	
      this.jmisrv.denno = await this.jmisrv.getDenno();
      return new Promise(resolve => {
        this.jmeitbl().editJyumei(this.jmisrv.denno);
        const jyumei = this.jmisrv.trjyumei;
        let jyumzai = this.jmisrv.trjmzai;
        const trjyuden: JyudenNew[] = [{
          ...{
            id: this.usrsrv.compid,
            denno: this.jmisrv.denno,
            created_at: new Date(),
            created_by: this.usrsrv.staff.code,
            // jdstatus: this.jmisrv.getJdsta(jyumei)
          }
          , ...jyuden,
        }]
        // console.log(trjyuden, jyumei);
        this.jmisrv.insJyuden(trjyuden, jyumei, jyumzai)
          .then(result => {
            // console.log('insert_trjyu', result);
            this.usrsrv.toastSuc('受注伝票' + this.jmisrv.denno + 'を新規登録しました');
            //  zaiko更新処理 　新規
            if (jyuden.skbn != "1") {
              this.jmisrv.zaikoNew.forEach(z => this.jmisrv.updZaiko(z));
            }
            // 受注可能数が少ない商品があれば、キープ表を送るよう促す（NAS への保存はボタンを押してから）
            suggest(JDST.TOROKU);
            this.form.markAsPristine();
            this.cancel();
            return resolve(true);
			this.jmisrv.isSaving = false;
          }).catch(error => {
            this.usrsrv.toastErr('データベースエラー', '受注伝票の新規登録ができませんでした');
            console.log('error insert_jyuden', error);
            return resolve(false);
			this.jmisrv.isSaving = false; 
          });
      });
    } else {//照会
      return new Promise(resolve => { return resolve(true); })
    }
  }

}
