import { Component, OnInit, AfterViewInit, ChangeDetectorRef, ElementRef, ViewEncapsulation, ChangeDetectionStrategy, viewChild, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators, AbstractControl } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import * as Query from './queries.mstg';
import * as AutoKana from 'vanilla-autokana';
import { GdstblComponent, TnkAction } from './gdstbl.component';
import { GtnktblComponent } from './gtnktbl.component';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { GrpcdhelpComponent } from './../share/grpcdhelp/grpcdhelp.component';
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { GdsimageComponent } from './../share/gdsimage/gdsimage.component';
import { UserService } from './../services/user.service';
import { GoodsService } from './goods.service';
import { BunruiService } from './../services/bunrui.service';
import { VendsService } from './../mstvendor/vends.service';

interface AffectedRows { affected_rows: number }
/** get_grpcode クエリの結果 */
interface GgroupCodeResult { msggroup: { code: string }[] }
/** get_ggroup クエリの結果 */
interface GgroupResult { msggroup_by_pk: mwI.Ggroup }
/** upd_ggroup / ins_group ミューテーションの結果 */
interface GgroupUpdateResult { update_msggroup: AffectedRows; insert_msgoods: AffectedRows; insert_msgtanka: AffectedRows }
interface GgroupInsertResult { insert_msggroup: AffectedRows; insert_msgoods: AffectedRows; insert_msgtanka: AffectedRows }
/** 保存時に msggroup へ渡す値（登録時のみ created_at / created_by を追加する） */
type GgroupInput = Pick<mwI.Ggroup, 'code' | 'kana' | 'name' | 'gkbn' | 'memo' | 'sozai' | 'vcode' | 'specurl' | 'category' | 'subcat' | 'updated_at' | 'updated_by'> & {
  id: number;
  created_at?: Date;
  created_by?: string;
};
/** 保存時に msgoods へ渡す値 */
type GoodsInput = Pick<mwI.Goods, 'gcode' | 'size' | 'color' | 'gskbn' | 'jan' | 'weight' | 'unit' | 'tkbn' | 'gtext' | 'max' | 'send' | 'ordering' | 'koguchi' | 'lot' | 'vgcode' | 'hgcode'> & {
  id: number;
  code: string;
};
/** 保存時に msgtanka へ渡す値（単価・原価は、カンマを除いた文字列で送る） */
interface TankaInput {
  id: number;
  gcode: string;
  day: string;
  tanka1: string | null; tanka2: string | null; tanka3: string | null; tanka4: string | null; tanka5: string | null;
  tanka6: string | null; tanka7: string | null; tanka8: string | null; tanka9: string | null;
  cost: string | null;
  genka: string | null;
  taxrate: number;
  currency: string;
}
/** 商品グループのフォーム の項目名（明細の mtbl は除く） */
type GoodsGroupField = 'kana' | 'name' | 'gkbn' | 'memo' | 'sozai' | 'vcode' | 'genre' | 'specurl' | 'category' | 'subcat';

@Component({
    selector: 'app-mstgoods',
    templateUrl: './mstgoods.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    }
})
export class MstgoodsComponent implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private el = inject(ElementRef);
  private title = inject(Title);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  cdRef = inject(ChangeDetectorRef);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  vensrv = inject(VendsService);
  gdssrv = inject(GoodsService);
  private apollo = inject(Apollo);
  private overlay = inject(Overlay);

  readonly gdstbl = viewChild.required(GdstblComponent);
  readonly gtnktbl = viewChild.required(GtnktblComponent);

  form!: FormGroup;
  /** フォームの項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
  private get ctl(): Record<GoodsGroupField, AbstractControl> {
    return this.form.controls as Record<GoodsGroupField, AbstractControl>;
  }
  mode: number = 3;
  rows: FormArray = this.fb.array([]);
  rows2: FormArray = this.fb.array([]);
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor() {
    this.title.setTitle('商品マスタ(MWSystem)');
  }

  ngOnInit(): void {
    this.vensrv.getVendors();
    this.bunsrv.getBunrui();
    // this.stfsrv.get_staff();
    this.form = this.fb.group({
      kana: new FormControl('', Validators.required),
      name: new FormControl('', Validators.required),
      gkbn: new FormControl('', Validators.required),
      memo: new FormControl(''),
      sozai: new FormControl(''),
      vcode: new FormControl(''),
      genre: new FormControl(''),
      specurl: new FormControl(''),
      category: new FormControl(''),
      subcat: new FormControl(''),
      mtbl: this.rows,
      mtbl2: this.rows2
    });

    if (this.gdssrv.ggrps.length == 0) {
      if (!this.overlayRef.hasAttached()) {
        this.overlayRef.attach(new ComponentPortal(MatSpinner));
      }
      this.gdssrv.getGgroups().then(result => {
        this.overlayRef.detach();
      });
    }
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.route.paramMap.subscribe((params: ParamMap) => {
      const grpcd = params.get('grpcd');
      if (grpcd != null) {
        //１件分だけ先に読込
        this.gdssrv.grpcd = grpcd;
        this.getGgroup(this.gdssrv.grpcd);
      }
      if (params.get('mode') === null) {
        this.mode = 3;
      } else {
        this.mode = Number(params.get('mode'));
      }
    });
    this.refresh();
    AutoKana.bind('#first-fld', '#kanafld', { katakana: true });
  }

  diaImage(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.data = {
      grpcd: this.gdssrv.grpcd,
      url: this.form.value.specurl
    };
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(GdsimageComponent, dialogConfig);
  }

  grpcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.autoFocus = true;
    dialogConfig.data = {
      code: this.gdssrv.grpcd
    };
    // console.log(dialogConfig.data);
    let dialogRef = this.dialog.open(GrpcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.gdssrv.grpcd = data.code;
          this.getGgroup(this.gdssrv.grpcd);
        }
      }
    );
  }

  gcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      gcode: this.gdssrv.grpcd
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.gdssrv.grpcd = data.gcode;
          this.getGgroup(this.gdssrv.grpcd);
        }
      }
    );
  }

  canEnter(e: Event): void {
    let element = e.target as HTMLElement;
    // console.log(element,element.tagName);
    if (element.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  }
  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.ctl.vcode.setValue(data.code);
          this.cdRef.detectChanges();
        }
      }
    );
  }

  updKana(value: string) {
    let val: string = this.usrsrv.convKana(value);
    // console.log(value,val);
    this.ctl.kana.setValue(val);
  }

  convUpper(event: Event) {
    console.log((event.target as HTMLInputElement));
    this.gdssrv.grpcd = this.usrsrv.convUpper((event.target as HTMLInputElement)?.value);
  }

  getGgroup(grpcd: string) {
    // if (!this.overlayRef) {
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    // }
    if (grpcd) {
      grpcd = this.usrsrv.convUpper(grpcd);
      this.apollo.watchQuery<GgroupCodeResult>({
        query: Query.GetMast0,
        variables: {
          id: this.usrsrv.compid,
          code: grpcd
        },
      }).valueChanges
        .subscribe(({ data }) => {
          if ((data as GgroupCodeResult).msggroup.length == 0) {
            this.form.reset();
            history.replaceState('', '', './mstgoods');
            this.overlayRef.detach();
            if (this.mode > 1) {
              this.usrsrv.toastWar("商品コード、グループコードどちらでも登録されていません");
            } else {
              this.el.nativeElement.querySelector('#first-fld').focus();
            }
          } else {
            let lcgrpcd = (data as GgroupCodeResult).msggroup[0].code;
            if (this.mode == 1) {
              this.usrsrv.toastWar("商品グループコード" + lcgrpcd + "は登録済です。新規登録ボタンからやり直してください");
              this.mode = 3;
            }
            this.apollo.watchQuery<GgroupResult>({
              query: Query.GetMast1,
              variables: {
                id: this.usrsrv.compid,
                grpcd: lcgrpcd
              },
            }).valueChanges
              .subscribe(({ data }) => {
                this.form.reset();
                let ggroup: mwI.Ggroup = (data as GgroupResult).msggroup_by_pk;
                this.form.patchValue(ggroup);
                this.usrsrv.setTmstmp(ggroup);
                this.gdssrv.goods = [];
                this.gdssrv.gtnks = [];
                for (let i = 0; i < ggroup.msgoods.length; i++) {
                  const { msgtankas, ...good } = ggroup.msgoods[i];// ggroup.msgoods[i]からmsgtankasを除外して、goodに代入         
                  this.gdssrv.goods.push(good);
                  for (let j = 0; j < ggroup.msgoods[i].msgtankas.length; j++) {
                    this.gdssrv.gtnks.push(Object.assign({ gcode: ggroup.msgoods[i].gcode }, ggroup.msgoods[i].msgtankas[j]));
                  }
                }
                this.gdstbl().setGoods();
                this.gtnktbl().setGtanka();
                // if(this.mode==3){
                //   this.form.disable();
                // }else{
                //   this.form.enable();
                // }
                this.gdssrv.grpcd = lcgrpcd;
                this.overlayRef.detach();
                this.refresh();
                // console.log(this.form.enabled);
                // this.cdRef.detectChanges();
                history.replaceState('', '', './mstgoods/' + this.mode + '/' + this.gdssrv.grpcd);
              }, (error) => {
                this.usrsrv.toastErr("読込エラー", "ブラウザを再起動しても直らなければ、連絡を！");
                this.form.reset();
                console.log('error query get_ggroup', error);
                history.replaceState('', '', './mstgoods');
                this.overlayRef.detach();
              });
          }
        });
    }
  }

  refresh(): void {
    // if( this.gdssrv.grpcd ){
    //   this.get_ggroup(this.gdssrv.grpcd);
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

  modeToCre(): void {
    this.mode = 1;
    this.gdssrv.grpcd = "";
    this.form.reset();
    this.frmArr.clear();
    this.frmArr2.clear();
    this.gdstbl().insRow(false, 0);
    this.form.markAsPristine();
    this.refresh();
    // this.gdssrv.grpcd="新規登録"; 
  }

  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
    history.replaceState('', '', './mstgoods/' + this.mode + '/' + this.gdssrv.grpcd);
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      if (this.mode == 1) {
        this.gdssrv.grpcd = '';
        this.mode = 3;
        this.refresh();
      } else {
        this.mode = 3;
        this.getGgroup(this.gdssrv.grpcd);
      }
      this.form.markAsPristine();
      history.replaceState('', '', './mstgoods/' + this.mode + '/' + this.gdssrv.grpcd);
    }
  }

  save(): void {
    let ggroup: GgroupInput = {
      id: this.usrsrv.compid,
      code: this.gdssrv.grpcd,
      kana: this.usrsrv.editFrmval(this.form, 'kana'),
      name: this.usrsrv.editFrmval(this.form, 'name'),
      gkbn: this.usrsrv.editFrmval(this.form, 'gkbn'),
      memo: this.usrsrv.editFrmval(this.form, 'memo'),
      sozai: this.usrsrv.editFrmval(this.form, 'sozai'),
      vcode: this.usrsrv.editFrmval(this.form, 'vcode'),
      // tcode: this.usrsrv.editFrmval(this.form,'tcode'),
      specurl: this.usrsrv.editFrmval(this.form, 'specurl'),
      category: this.usrsrv.editFrmval(this.form, 'category'),
      subcat: this.usrsrv.editFrmval(this.form, 'subcat'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code
    };
    let gds: GoodsInput[] = [];
    this.frmArr.controls
      .forEach(control => {
        gds.push({
          id: this.usrsrv.compid,
          code: this.gdssrv.grpcd,
          gcode: this.usrsrv.editFrmval(control, 'gcode'),
          size: this.usrsrv.editFrmval(control, 'size'),
          color: this.usrsrv.editFrmval(control, 'color'),
          gskbn: this.usrsrv.editFrmval(control, 'gskbn'),
          jan: this.usrsrv.editFrmval(control, 'jan'),
          weight: this.usrsrv.editFrmval(control, 'weight'),
          unit: this.usrsrv.editFrmval(control, 'unit'),
          tkbn: this.usrsrv.editFrmval(control, 'tkbn'),
          // zkbn: this.usrsrv.editFrmval(control,'zkbn'),
          gtext: this.usrsrv.editFrmval(control, 'gtext'),
          max: this.usrsrv.editFrmval(control, 'max'),
          send: this.usrsrv.editFrmval(control, 'send'),
          ordering: this.usrsrv.editFrmval(control, 'ordering'),
          koguchi: this.usrsrv.editFrmval(control, 'koguchi'),
          lot: this.usrsrv.editFrmval(control, 'lot'),
          vgcode: this.usrsrv.editFrmval(control, 'vgcode'),
          hgcode: this.usrsrv.editFrmval(control, 'hgcode')
        });
      });
    let tnk: TankaInput[] = [];
    this.frmArr2.controls
      .forEach(control => {
        tnk.push({
          id: this.usrsrv.compid,
          gcode: this.usrsrv.editFrmval(control, 'gcode'),
          day: this.usrsrv.editDay(control, 'day'),
          tanka1: this.usrsrv.editInt(control, 'tanka1'),
          tanka2: this.usrsrv.editInt(control, 'tanka2'),
          tanka3: this.usrsrv.editInt(control, 'tanka3'),
          tanka4: this.usrsrv.editInt(control, 'tanka4'),
          tanka5: this.usrsrv.editInt(control, 'tanka5'),
          tanka6: this.usrsrv.editInt(control, 'tanka6'),
          tanka7: this.usrsrv.editInt(control, 'tanka7'),
          tanka8: this.usrsrv.editInt(control, 'tanka8'),
          tanka9: this.usrsrv.editInt(control, 'tanka9'),
          cost: this.usrsrv.editInt(control, 'cost'),
          genka: this.usrsrv.editInt(control, 'genka'),
          taxrate: this.usrsrv.editFrmval(control, 'taxrate'),
          currency: this.usrsrv.editFrmval(control, 'currency')
        });
      });

    if (this.mode == 2) {
      this.apollo.mutate<GgroupUpdateResult>({
        mutation: Query.UpdateMast1,
        variables: {
          id: this.usrsrv.compid,
          grpcd: this.gdssrv.grpcd,
          "_set": ggroup,
          ogds: gds,
          otnk: tnk
        },
        refetchQueries: [
          {
            query: Query.GetMast0,
            variables: {
              id: this.usrsrv.compid,
              code: this.gdssrv.grpcd
            },
          }],
      }).subscribe(({ data }) => {
        // console.log(data);
        this.usrsrv.toastSuc('商品グループ' + this.gdssrv.grpcd + 'の変更を保存しました');
        this.mode = 3;
        this.form.disable();
        this.form.markAsPristine();
        history.replaceState('', '', './mstgoods/3/' + this.gdssrv.grpcd);
      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '商品グループ' + this.gdssrv.grpcd + 'の変更保存ができませんでした');
        console.log('error update_msggroup', error);
      });
    } else {//新規登録
      ggroup.created_at = ggroup.updated_at;
      ggroup.created_by = this.usrsrv.staff.code;
      this.apollo.mutate<GgroupInsertResult>({
        mutation: Query.InsertMast1,
        variables: {
          object: [ggroup],
          ogds: gds,
          otnk: tnk
        },
        refetchQueries: [
          {
            query: Query.GetMast0,
            variables: {
              id: this.usrsrv.compid,
              code: this.gdssrv.grpcd
            },
          }],
      }).subscribe(({ data }) => {
        this.usrsrv.toastSuc('商品グループ' + this.gdssrv.grpcd + 'を新規登録しました');
        this.mode = 3;
        this.form.disable();
        this.form.markAsPristine();
        history.replaceState('', '', './mstgoods/3/' + this.gdssrv.grpcd);
      }, (error) => {
        this.usrsrv.toastErr('データベースエラー', '商品グループ' + this.gdssrv.grpcd + 'の登録ができませんでした');
        console.log('error insert_msggroup', error);
      });
    }
  }

  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }

  get frmArr2(): FormArray {
    return this.form.get('mtbl2') as FormArray;
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
                tooltip += this.usrsrv.getColtxt('msgoods', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors, i) + '\n';
              }
            }
          }
        } else if (name == 'mtbl2') {
          for (let i = 0; i < this.frmArr2.length; i++) {
            const ctrls = (this.frmArr2.at(i) as FormGroup).controls
            for (const nam in ctrls) {
              if (ctrls[nam].invalid) {
                tooltip += this.usrsrv.getColtxt('msgtanka', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors, i) + '\n';
              }
            }
          }

        } else {
          tooltip += this.usrsrv.getColtxt('msggroup', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
        }
      }
    }
    return tooltip;
  }

  test() {
    console.log(this.form);
  }

  shouldConfirmOnBeforeunload(): boolean {
    return this.form.dirty;
  }

  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }
  insTnkrow(emitParam: TnkAction) {
    // console.log(emitParam);
    if (emitParam.flg) {
      this.gtnktbl().insRow(emitParam.row, emitParam.flgCP);
    } else {
      this.gtnktbl().delRow(emitParam.row);
    }

  }

}