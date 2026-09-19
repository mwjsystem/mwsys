import { Component, OnInit, AfterViewInit, ElementRef, HostListener, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { DepttblComponent } from './depttbl.component';
import { Jyuden, Nyuden, Nyuhis, DepositService } from './deposit.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { MembsService } from './../mstmember/membs.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { JdnohelpComponent } from './../share/jdnohelp/jdnohelp.component';
import { NdnohelpComponent } from './../share/ndnohelp/ndnohelp.component';

@Component({
  selector: 'app-frmdeposit',
  templateUrl: './frmdeposit.component.html',
  styleUrls: ['./../app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FrmdepositComponent implements OnInit, AfterViewInit {
  @ViewChild(DepttblComponent) depttbl: DepttblComponent;
  form: FormGroup;
  denno: number = 0;
  rows: FormArray = this.fb.array([]);
  jyuden: Jyuden = new Jyuden();
  constructor(public usrsrv: UserService,
    public bunsrv: BunruiService,
    public stfsrv: StaffService,
    public memsrv: MembsService,
    public depsrv: DepositService,
    private fb: FormBuilder,
    private title: Title,
    private route: ActivatedRoute,
    private router: Router,
    private elementRef: ElementRef,
    private dialog: MatDialog,
    private cdRef: ChangeDetectorRef) {
    title.setTitle('入金伝票(MWSystem)');
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      // kubun: new FormControl(''),
      day: new FormControl(''),
      scde: new FormControl(''),
      code: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      memo: new FormControl(''),
      nmoneysum: new FormControl(''),
      smoneysum: new FormControl(''),
      tmoneysum: new FormControl(''),
      totalmoney: new FormControl(''),
      jdenno: new FormControl(''),
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
          this.depsrv.mode = +params.get('mode');
          this.refresh();
        }
        if (params.get('denno') !== null) {
          this.denno = +params.get('denno');
          this.getNyuden(this.denno);
        }
      });
    });
    this.depsrv.observeD.subscribe(flg => {
      this.cdRef.detectChanges();
    });
  }

  changeDno(event: KeyboardEvent) {
    this.getJyuden(+(event.target as HTMLInputElement));
  }

  getNyuden(denno: number) {
    this.depsrv.qryNyuden(denno).subscribe(
      result => {
        if (result == null) {
          this.usrsrv.toastInf("受注入金伝票番号" + denno + "は登録されていません");
          history.replaceState('', '', './frmdeposit');
        } else {
          if (result.kubun == 1) {
            this.usrsrv.toastInf('請求入金伝票です');
          } else {
            this.form.get('jdenno').setValue(+result.jdenno);
            this.getJyuden(result.jdenno);
            this.depsrv.nyuden = [];
            for (let i = 0; i < result.trnyudens.length; i++) {
              this.depsrv.nyuden.push(
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
            this.depttbl.setTbl();
            this.form.get('day').setValue(result.day);
            this.form.get('code').setValue(result.code);
            this.form.get('tcode').setValue(result.tcode);
            this.refresh();

          }
        }

      }, error => {
        console.log(error);
      }
    );
  }

  getJyuden(denno: number) {

    this.depsrv.qryJyuden(denno).subscribe(
      result => {
        let i: number = result.trnyusubs.findIndex(obj => obj.denno == this.denno);
        if (result.torikbn == true) {
          this.usrsrv.toastInf('この受注伝票は掛け請求伝票です');
        } else if (result.nyuzan <= 0 && (this.depsrv.mode == 1 || (this.depsrv.mode == 2 && i < 0))) {
          this.usrsrv.toastInf('この受注伝票は入金済です');
        } else {
          this.form.get('jdenno').setValue(denno);
          this.jyuden = result;
          this.form.get('scde').setValue(this.jyuden.scde);
          this.form.get('code').setValue(this.jyuden.scde);
          let nyuhis: Nyuhis[] = [];
          for (let i = 0; i < result.trnyusubs.length; i++) {
            if (this.denno !== result.trnyusubs[i].denno) {
              nyuhis.push(
                {
                  denno: result.trnyusubs[i].denno,
                  day: result.trnyusubs[i].day,
                  nmoney: result.trnyusubs[i].nmoney,
                  smoney: result.trnyusubs[i].smoney,
                  tmoney: result.trnyusubs[i].tmoney,
                  total: result.trnyusubs[i].nmoney - result.trnyusubs[i].smoney + result.trnyusubs[i].tmoney,
                  memo: result.trnyusubs[i].memo
                }
              );
            }
          }
          this.depsrv.subHis.next(nyuhis);
        }

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
    if (this.depsrv.mode == 3) {
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
      ftype: '0'
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

  jdennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      mcdfld: 'scde',
      mcode: this.form.value.scde,
      ftype: '0'
    };
    let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.form.get('jdenno').setValue(data.denno);
          this.getJyuden(data.denno);
        }
      }
    );

  }
  mcdHelp(fldnm: string): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.form.get(fldnm).setValue(data.mcode);
        }
      }
    );
  }
  test() {
    console.log(this.form);

  }
  modeToCre(): void {
    this.depsrv.mode = 1;
    this.form.reset();
    this.denno = 0;
    this.jyuden = new Jyuden();
    this.depsrv.subHis.next([new Nyuhis()]);
    this.depttbl.frmArr.clear();
    this.depttbl.insRow(1);
    this.refresh();
  }
  modeToUpd(): void {
    this.depsrv.mode = 2;
    this.refresh();
    history.replaceState('', '', './frmdeposit/' + this.depsrv.mode + '/' + this.denno);
  }
  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.depsrv.mode = 3;
      // this.get_hatden(this.denno);
      this.refresh();
      this.form.markAsPristine();
      history.replaceState('', '', './frmdeposit/' + this.depsrv.mode + '/' + this.denno);
    }
  }
  async save() {
    let head: any = {
      day: this.usrsrv.editFrmval(this.form, 'day'),
      mcode: this.usrsrv.editFrmval(this.form, 'scde'),
      code: this.usrsrv.editFrmval(this.form, 'code'),
      jdenno: this.usrsrv.editFrmval(this.form, 'jdenno'),
      tcode: this.usrsrv.editFrmval(this.form, 'tcode'),
      updated_at: new Date(),
      updated_by: this.usrsrv.staff.code
    }

    if (this.depsrv.mode == 2) {
      let dept = this.depttbl.getMtbl(this.denno);
      this.depsrv.updNyuden(this.denno, head, dept)
        .then(result => {
          // console.log('update_hatden',result);
          this.usrsrv.toastSuc('入金伝票' + this.denno + 'の変更を保存しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '入金伝票' + this.denno + 'の変更保存ができませんでした');
          console.log('error update_nyuden', error);
        });


    } else {//新規登録
      this.denno = await this.usrsrv.getNumber('ndenno', 1, this.denno);
      let dept = this.depttbl.getMtbl(this.denno);
      const trnyusub = [{
        ...{
          id: this.usrsrv.compid,
          denno: this.denno,
          created_at: new Date(),
          created_by: this.usrsrv.staff.code,
        }
        , ...head
      }]
      this.depsrv.insNyuden(trnyusub, dept)
        .then(result => {
          // console.log('insert_trhat',result);
          this.usrsrv.toastSuc('入金伝票' + this.denno + 'を新規登録しました');
          this.form.markAsPristine();
          this.cancel();
        }).catch(error => {
          this.usrsrv.toastErr('データベースエラー', '入金伝票の新規登録ができませんでした');
          console.log('error insert_nyusub', error);
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

  shouldConfirmOnBeforeunload(): boolean {
    return this.form.dirty;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: Event) {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }

}
