import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { dropEmptyMei, validIgnoringEmpty } from '../share/mei-row';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";

import { Zaiko, Movsub, MovingService, MovsubSet, MovsubNew, EXTYPE_MOVE } from './moving.service';
import { MovprintComponent, MovprintData } from './movprint.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { OkuriService } from './../services/okuri.service';
import { ShipService } from './../frmship/ship.service';
import { AdredaComponent } from './../share/adreda/adreda.component';
import { MdnohelpComponent } from './../share/mdnohelp/mdnohelp.component';
import { MovtblComponent } from './movtbl.component';
import { BeforeunloadBase } from '../beforeunload-base';
import { filter } from 'rxjs/operators';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatSuffix, MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { TmstmpComponent } from '../core/tmstmp/tmstmp.component';
import { TabDirective } from '../core/directives/tabidx/tab.directive';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatSelect, MatOption } from '@angular/material/select';
import { JdatePipe } from '../core/pipes/jdate.pipe';
import { ModetxtPipe } from '../core/pipes/modetxt.pipe';

/** 移動入力フォーム の項目名（明細の mtbl は除く） */
type MoveField = 'day' | 'incode' | 'outcode' | 'tcode' | 'hcode' | 'hday' | 'htime' | 'okurisuu' | 'okurino' | 'dmemo' | 'smemo' | 'omemo' | 'szip' | 'sadr' | 'sname' | 'stel';

@Component({
    selector: 'app-frmmove',
    templateUrl: './frmmove.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatButton, MatIcon, MatTooltip, FormsModule, MatIconButton, MatSuffix, ReactiveFormsModule, MatCard, MatCardHeader, MatCardTitle, TmstmpComponent, MatCardContent, MatFormField, TabDirective, MatLabel, MatInput, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, MatSelect, MatOption, MovtblComponent, JdatePipe, ModetxtPipe]
})
export class FrmmoveComponent extends BeforeunloadBase implements OnInit {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  okrsrv = inject(OkuriService);
  strsrv = inject(StoreService);
  movsrv = inject(MovingService);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private overlay = inject(Overlay);
  private cdRef = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private title = inject(Title);

  private shipsrv = inject(ShipService);
  shipBusy = false;
  /** 倉庫で数量を確認した日時・担当者・内容（スマホで QR → JAN） */
  chk: { at: string | null; by: string | null; memo: string | null } = { at: null, by: null, memo: null };

  readonly movtbl = viewChild.required(MovtblComponent);
  form!: FormGroup;
  /** フォームの項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
  private get ctl(): Record<MoveField, AbstractControl> {
    return this.form.controls as Record<MoveField, AbstractControl>;
  }
  denno: number = 0;
  mode: number = 3;
  hktval: mwI.Sval[] = [];
  rows: FormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor() {
    super();
    const title = this.title;

    title.setTitle('移動伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      day: new FormControl('', Validators.required),
      incode: new FormControl('', Validators.required),
      outcode: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      hcode: new FormControl(),
      hday: new FormControl(),
      htime: new FormControl(),
      okurisuu: new FormControl(),
      okurino: new FormControl(),
      dmemo: new FormControl(),
      smemo: new FormControl(),
      omemo: new FormControl(),
      szip: new FormControl(),
      sadr: new FormControl(),
      sname: new FormControl(),
      stel: new FormControl(),
      mtbl: this.rows
    });
    this.okrsrv.getHaisou();
    this.okrsrv.getHokuri();
    this.okrsrv.getHktime();
    this.strsrv.getStore();
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.route.paramMap.subscribe((params: ParamMap) => {
      if (params.get('mode') === null) {
        this.cancel();
      } else if (Number(params.get('mode')) == 1) {
        this.modeToCre();
        this.route.queryParams.pipe(
          filter(p => Object.keys(p).length !== 0)
        ).subscribe(
          params => {
            Object.keys(params).map(k => {
              if (k == "stkey") {
                const stra = JSON.parse(localStorage.getItem(params[k]) ?? 'null');
                this.form.patchValue({ incode: stra.incode, outcode: stra.outcode });
                this.movtbl().insRows(stra.mei, true);
                localStorage.removeItem(params[k]);
              }
            })
          }
        )
        this.denno = Number(params.get('denno'));
        this.ctl.tcode.setValue(this.usrsrv.staff?.code);
      } else {
        this.mode = Number(params.get('mode'));
        if (params.get('denno') !== null) {
          this.denno = Number(params.get('denno'));
          // console.log(this.denno);
          this.getMovden(this.denno);
        }
        this.refresh();
      }
    });

    this.movsrv.observe.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }

  getMovden(denno: number): void {
    if (denno > 0) {
      if (!this.overlayRef.hasAttached()) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.movsrv.qryMovden(denno).subscribe(
        result => {
          this.form.reset();
          this.chk = { at: result?.chk_at ?? null, by: result?.chk_by ?? null, memo: result?.chkmemo ?? null };
          if (result == null) {
            this.usrsrv.toastWar("移動伝票番号" + denno + "は登録されていません");
            history.replaceState('', '', './frmmove');
          } else {
            // console.log(result);
            // 配送方法は数値の列で返る（送り状マスタのコードは文字）。文字にしないと選択肢と合わず空に見える
            let movsub: Movsub = { ...result, hcode: result.hcode == null ? result.hcode : String(result.hcode) } as Movsub;
            this.form.patchValue(movsub);
            this.selHcd(movsub.hcode); // 保存済みの配送方法に合わせて、配送時間の候補を出す
            this.usrsrv.setTmstmp(movsub);
            this.movtbl().setMovmei(movsub.trmovdens);
            // this.form.patchValue({mtax:this.vensrv.get_vendor(this.form.getRawValue()['vcode'])?.mtax});
            this.denno = denno;
            history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
          }
          this.refresh();
          this.overlayRef.detach();
        }, error => {
          console.log('error query GetHatden', error);
          this.usrsrv.toastWar("移動伝票番号" + denno + "は登録されていません");
          this.form.reset();
          history.replaceState('', '', './frmmove');
          this.overlayRef.detach();
        }
      );
    }
    this.cdRef.detectChanges();
  }
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }

  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    this.getMovden(this.denno);
  }

  openOkuri(hcode: string, value: string) {
    window.open(this.okrsrv.getUrl(hcode) + value, '_blank');
  }

  async setOkrno() {
    let okrno: string = await this.okrsrv.setOkurino(this.form.value.hcode);
    this.ctl.okurino.setValue(okrno);
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
  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(MdnohelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.denno = data.denno;
          this.getMovden(this.denno);

        }
      }
    );

  }
  refresh(): void {
    // if (this.denno >0 ){
    // }
    if (this.mode == 3) {
      this.form.disable();
      // this.usrsrv.disable_mtbl(this.form);
    } else {
      this.form.enable();
      // this.usrsrv.enable_mtbl(this.form);
    }
    this.cdRef.detectChanges();
  }

  /**
   * 出荷指示: この移動伝票の出荷指示フォルダ（出荷指示書・送り状 CSV）を NAS に作る（受注伝票の出荷指示と同じ保存先）。
   * e飛伝Ⅱ・CLOUD の送り状 CSV は、この PC の送り状CSVフォルダ（無ければダウンロード）
   */
  async shipMove() {
    if (!this.denno) {
      return;
    }
    this.shipBusy = true;
    this.cdRef.detectChanges();
    try {
      const s = await this.shipsrv.saveMoveToNas(this.denno);
      const r = s.results[0];
      if (r.error) {
        throw new Error(r.error);
      }
      for (const f of s.downloads) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(f.blob);
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      this.usrsrv.toastSuc('出荷指示フォルダを作成しました（' + r.dir + (r.sasikae ? '・差替分' : '') + '）' +
        [...s.csvSaved.map(e => ' 送り状CSV：' + e), ...s.notes.map(e => ' ' + e)].join(''));
      this.getMovden(this.denno);
    } catch (e) {
      this.usrsrv.toastErr('出荷指示フォルダを作成できませんでした', (e as Error).message);
      console.log('error shipMove', e);
    }
    this.shipBusy = false;
    this.cdRef.detectChanges();
  }

  /** 移動伝票の操作ログ（登録・変更・倉庫での確認）を表示する */
  opelog() {
    if (!this.denno) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_MOVE, keycode: String(this.denno), title: '移動伝票 ' + this.denno, table: 'trmovsub' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data: data });
  }

  /** 帳票（移動伝票・キープ伝票・本社引取・発送依頼・織マーク付け依頼・お渡し依頼・大会リスト） */
  printMove() {
    if (!this.denno) {
      return;
    }
    const data: MovprintData = { denno: this.denno };
    this.dialog.open(MovprintComponent, { width: '640px', maxWidth: '95vw', data });
  }

  /** 倉庫で確認した日時・担当者 */
  chkText(): string {
    if (!this.chk.at) {
      return '';
    }
    const t = new Date(this.chk.at);
    return (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0')
      + (this.chk.by ? ' ' + (this.stfsrv.getName(this.chk.by) || this.chk.by) : '');
  }

  /** 保存ボタンを押せるか（明細の空の行だけが原因のエラーなら押せる。保存の前にその行を消す） */
  canSave(): boolean {
    return validIgnoringEmpty(this.form);
  }

  async save() {
    if (dropEmptyMei(this.form.get('mtbl') as FormArray)) {
      this.movtbl().refresh();
    }
    let movsub: MovsubSet = {
      day: this.usrsrv.editFrmday(this.form, 'day'),
      outcode: this.usrsrv.editFrmval(this.form, 'outcode'),
      incode: this.usrsrv.editFrmval(this.form, 'incode'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      hcode: this.usrsrv.editFrmval(this.form, 'hcode'),
      hday: this.usrsrv.editFrmday(this.form, 'hday'),
      htime: this.usrsrv.editFrmval(this.form, 'htime'),
      okurisuu: this.usrsrv.editFrmval(this.form, 'okurisuu'),
      okurino: this.usrsrv.editFrmval(this.form, 'okurino'),
      dmemo: this.usrsrv.editFrmval(this.form, 'dmemo'),
      omemo: this.usrsrv.editFrmval(this.form, 'omemo'),
      smemo: this.usrsrv.editFrmval(this.form, 'smemo'),
      szip: this.usrsrv.editFrmval(this.form, 'szip'),
      sadr: this.usrsrv.editFrmval(this.form, 'sadr'),
      sname: this.usrsrv.editFrmval(this.form, 'sname'),
      stel: this.usrsrv.editFrmval(this.form, 'stel'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff?.code,
    }

    // console.log('save',this.mode,this.form)
    if (this.mode == 2) {
      let movmei = this.movtbl().getMovmei(this.denno);
      //  在庫: 読込時分の取り消し（マイナス）と今回分（入庫先へ加算・出庫元から減算）を、伝票と同じトランザクションで書く
      const zaikoNew = this.movtbl().getZaikoNew(movsub.day, movsub.incode, movsub.outcode);
      this.movsrv.updMovden(this.denno, movsub, movmei, [...this.movtbl().trzaiko, ...zaikoNew])
        .then(result => {
          this.usrsrv.toastSuc('移動伝票' + this.denno + 'の変更を保存しました');
          //  保存後にもう一度変更保存しても在庫が狂わないよう、取り消し用データを今回の内容に入れ替える
          this.movtbl().setTrzaikoFrom(zaikoNew);
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '移動伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_movsub', error);
        });
    } else {//新規登録
      // console.log('sinki0',this.denno);
      
	  this.denno = await this.usrsrv.getNumber('mdenno', 1, this.denno);
	  // console.log('sinki1',this.denno);
      const movmei = this.movtbl().getMovmei(this.denno);
	  // console.log('sinki',movmei);
      const trmovsub: MovsubNew[] = [{
        ...{
          id: this.usrsrv.compid,
          denno: this.denno,
          created_at: new Date(),
          created_by: this.usrsrv.staff?.code,
        }
        , ...movsub,
      }]
      //  在庫（各明細の構成品ごとに、入庫先へ加算・出庫元から減算）を、伝票と同じトランザクションで書く
      const zaikoNew = this.movtbl().getZaikoNew(movsub.day, movsub.incode, movsub.outcode);
      this.movsrv.insMovden(trmovsub, movmei, zaikoNew)
        .then(result => {
          this.usrsrv.toastSuc('移動伝票' + this.denno + 'を新規登録しました');
          //  登録直後に変更保存しても在庫が狂わないよう、取り消し用データを今回の内容にしておく
          this.movtbl().setTrzaikoFrom(zaikoNew);
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '移動伝票の新規登録ができませんでした');
          console.log('error insert_movden', error);
        });
    }

  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.ctl.tcode.setValue(this.usrsrv.staff?.code);
    this.ctl.day.setValue(new Date());
    this.movtbl().frmArr.clear();
    this.movtbl().addRows(1);
    this.refresh();

  }

  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
    history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode = 3;
      // 照会に戻すときは入力できないようにする（以前は mode を変えるだけで、保存後・キャンセル後も入力できてしまった）。
      // 受注伝票・発注伝票と同じく、保存した内容を読み直して表示する（キャンセルしたときは変更を捨てる）
      if (this.denno > 0) {
        this.getMovden(this.denno);
      }
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
    }
  }
  getInvalid(): string {
    let tooltip: string = "";
    const ctrls0 = this.form.controls;
    // for (const name in ctrls0) {
    //   if (ctrls0[name].invalid) {
    //     if (name == 'mtbl') {
    //       for (let i = 0; i < this.frmArr.length; i++) {
    //         const ctrls = (this.frmArr.at(i) as FormGroup).controls
    //         for (const nam in ctrls) {
    //           if (ctrls[nam].invalid) {
    //             tooltip += this.usrsrv.getColtxt('trmovden', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
    //           }
    //         }
    //       }

    //     } else {
    //       tooltip += this.usrsrv.getColtxt('trmovsub', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
    //     }
    //   }
    // }
    return tooltip;
  }

}
