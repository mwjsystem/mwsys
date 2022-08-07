import { Component, OnInit, HostListener, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { UserService } from './../services/user.service';
import { EdaService } from './../share/adreda/eda.service';
import { AdredaComponent } from './../share/adreda/adreda.component';

@Component({
  selector: 'app-frmmove',
  templateUrl: './frmmove.component.html',
  styleUrls: ['./frmmove.component.scss']
})
export class FrmmoveComponent implements OnInit {
  form: FormGroup;
  denno: number = 0;
  mode: number = 3;

  constructor(public usrsrv: UserService,
    private fb: FormBuilder,
    private title: Title) {
    title.setTitle('移動伝票(MWSystem)');
  }

  ngOnInit(): void {
  }
  get frmArr(): FormArray {
    return this.form.get('mtbl') as FormArray;
  }

  onEnter() {
    this.denno = this.usrsrv.convNumber(this.denno);
    // this.get_jyuden(this.jmisrv.denno);
  }
  dennoHelp() {
    // let dialogConfig = new MatDialogConfig();
    // dialogConfig.width = '100vw';
    // dialogConfig.height = '98%';
    // dialogConfig.panelClass = 'full-screen-modal';
    // if (flg) {
    //   dialogConfig.data = {
    //     mcode: this.form.value.ncode,
    //     mcdfld: 'ncode'
    //   };
    // }
    // let dialogRef = this.dialog.open(JdnohelpComponent, dialogConfig);
    // dialogRef.afterClosed().subscribe(
    //   data => {
    //     if (typeof data != 'undefined') {
    //       if (flg) {
    //         this.form.get('dokono').setValue(data.denno);
    //         this.form.get('okurino').setValue(data.okurino);
    //       } else {
    //         this.jmisrv.denno = data.denno;
    //         this.get_jyuden(this.jmisrv.denno);
    //       }
    //     }
    //   }
    // );

  }
  canEnter(e: KeyboardEvent): void {
    let element = e.target as HTMLElement;
    // console.log(element,element.tagName);
    if (element.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  }
  save() {

  }
  modeToCre(): void {
    this.mode = 1;
    this.form.reset();

  }

  modeToUpd(): void {
    this.mode = 2;
    history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
  }

  cancel(): void {
    if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      this.mode = 3;
      this.form.markAsPristine();
      history.replaceState('', '', './frmmove/' + this.mode + '/' + this.denno);
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
                tooltip += this.usrsrv.getColtxt('trmovden', nam) + '⇒' + this.usrsrv.getValiderr(ctrls[nam].errors) + '\n';
              }
            }
          }

        } else {
          tooltip += this.usrsrv.getColtxt('trmovsub', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
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
