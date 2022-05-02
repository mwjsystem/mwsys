import { Component, OnInit, AfterViewInit, ElementRef, HostListener, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { DepttblComponent } from './depttbl.component';
import { Jyuden, DepositService } from './deposit.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';
import { MembsService } from './../services/membs.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { JdnohelpComponent } from './../share/jdnohelp/jdnohelp.component';

@Component({
  selector: 'app-frmdeposit',
  templateUrl: './frmdeposit.component.html',
  styleUrls: ['./../app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FrmdepositComponent implements OnInit, AfterViewInit {
  // @ViewChild(DepttblComponent) depttbl: DepttblComponent;
  form: FormGroup;
  denno: number = 0;
  jdno: number = 0;
  rows: FormArray = this.fb.array([]);
  jyuden: Jyuden;
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
      kubun: new FormControl(''),
      denno: new FormControl('', Validators.required),
      day: new FormControl('', Validators.required),
      scde: new FormControl('', Validators.required),
      code: new FormControl('', Validators.required),
      tcode: new FormControl('', Validators.required),
      nmoneysum: new FormControl(''),
      smoneysum: new FormControl(''),
      tmoneysum: new FormControl(''),
      totalmoney: new FormControl(''),
      jdenno: new FormControl(''),
      sdenno: new FormControl(''),
      mtbl: this.rows
    });
  }
  ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    this.memsrv.get_members().then(result => {
      this.route.paramMap.subscribe((params: ParamMap) => {
        if (params.get('mode') === null) {
          this.cancel();
        } else {
          this.depsrv.mode = +params.get('mode');
          this.refresh();
        }
        if (params.get('denno') !== null) {
          this.denno = +params.get('denno');
          // this.get_jyuden(data.denno);
        }
      });
    });
  }

  get_jyuden(denno: number) {
    this.depsrv.qry_jyuden(denno).subscribe(
      result => {
        this.jyuden = result;
        this.form.get('scde').setValue(this.jyuden.scde);
        this.form.get('code').setValue(this.jyuden.scde);
        console.log(this.jyuden);
      }, error => {
        console.log(error);
      }
    );
  }

  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }
  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
  }
  refresh(): void {
    if (this.depsrv.mode == 3) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    this.cdRef.detectChanges();
  }
  dennoHelp() {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = { mcdfld: 'scde', mcode: this.form.value.scde };
    let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.form.get('jdenno').setValue(data.denno);
          // console.log(data.denno);
          this.get_jyuden(data.denno);
          // this.cdRef.detectChanges();
          // console.log(this.jdno);
          // this.get_hatden(this.denno);
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

  modeToCre(): void {
    this.depsrv.mode = 1;
    this.form.reset();
    this.denno = 0;

    // this.hmeitbl.frmArr.clear();
    // this.hmeitbl.add_rows(1);
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
