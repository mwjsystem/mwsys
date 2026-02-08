import { Component, OnInit, Input, ViewChild, ViewChildren, QueryList, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { SpdethelpComponent } from './../share/spdethelp/spdethelp.component';
import { JmzaitblComponent } from './jmzaitbl.component';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StoreService } from './../services/store.service';
import { StockService } from './../services/stock.service';
// import { GoodsService } from './../services/goods.service';
import { MembsService } from './../mstmember/membs.service';
import { JyumeiService } from './jyumei.service';
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';
// import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-jmeitbl',
  templateUrl: './jmeitbl.component.html',
  styleUrls: ['./../tbl.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JmeitblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, { static: false }) paginator: MatPaginator;
  @ViewChildren('gcdInputs') gcdInps: QueryList<ElementRef>;
  private el: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard: string;
  navCli = navigator.clipboard;
  jmeikbn: string;
  // jyumei: mwI.Jyumei[] = [];
  hatden = [];
  movden = [];
  mall: boolean = false;
  hidx = 20; //tabindex用ヘッダ項目数
  mcols = 4; //tabindex用明細列数
  displayedColumns: string[];
  flgCol: boolean = false;
  setZai = [];
  defCol = ['chk',
    'line',
    // 'line2',
    'gcode',
    'gtext',
    'suu',
    'unit',
    'rate',
    'tanka',
    'tinmoney',
    'mmemo',
    'pable',
    'scode',
    'spec',
    'spdet',
    'mtax'];
  addCol = ['genka',
    'sday',
    'tanka1',
    'toutmoney',
    'money',
    'tgenka',
    'taxmoney',
    'taxrate',
    'currency'];

  constructor(private cdRef: ChangeDetectorRef,
    private elementRef: ElementRef,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private apollo: Apollo,
    // private toastr: ToastrService,
    public usrsrv: UserService,
    public bunsrv: BunruiService,
    public strsrv: StoreService,
    public stcsrv: StockService,
    // public gdssrv: GoodsService,
    public memsrv: MembsService,
    public jmisrv: JyumeiService) { }

  ngOnInit(): void {
    this.displayedColumns = this.defCol;
    this.addRows(1);
    this.refresh();
    // console.log(this.frmArr.getRawValue()[this.getIdx(0)]);
  }

  calcTot() {
    let lcgtotalzn: number = 0;
    let lcsoryozn: number = 0;
    let lctesuzn: number = 0;
    let lcnebikizn: number = 0;
    let lctaxtotal: number = 0;
    let lctotal: number = 0;
    let lcgenka: number = 0;
    let lctot8: number = 0;
    let lctot10: number = 0;
    const arr = this.frmArr.getRawValue();
    for (let i = 0; i < arr.length; i++) {
      // console.log(arr[i]['tinmoney']);
      switch (arr[i]['gkbn']) {
        case '0':
          lcgtotalzn += arr[i]['toutmoney'];
          break;
        case '1':
          lcsoryozn += arr[i]['toutmoney'];
          break;
        case '2':
          lctesuzn += arr[i]['toutmoney'];
          break;
        case '3':
          lcnebikizn += arr[i]['toutmoney'];
          break;
      }
      switch (arr[i]['taxrate']) {
        case '8':
          lctot8 += arr[i]['tinmoney'];
          break;
        case '10':
          lctot8 += arr[i]['tinmoney'];
          break;
      }
      lctaxtotal += arr[i]['taxmoney'];;
      lcgenka += arr[i]['tgenka'];
    }
    lctotal = lcgtotalzn + lcsoryozn + lctesuzn + lcnebikizn + lctaxtotal;
    this.parentForm.patchValue({
      gtotalzn: lcgtotalzn,
      soryozn: lcsoryozn,
      tesuzn: lctesuzn,
      nebikizn: lcnebikizn,
      taxtotal: lctaxtotal,
      total: lctotal,
      genka: lcgenka,
      total8: lctot8,
      total10: lctot10
    });
    this.jmisrv.subject.next(true);
    // this.jmisrv.subject.complete();
    this.refresh();
    // console.log(this.frmArr, this.parentForm);
  }
  calcMei(i: number): void {
    const ctrl = this.frmArr.controls[i].value;
    const lcmoney: number = ctrl.tanka * ctrl.suu;
    const lctaxrate: number = +this.frmArr.getRawValue()[i]['taxrate'] / 100;
    let lctaxmoney: number = 0;
    let lctoutmoney: number = 0;
    let lctinmoney: number = 0;
    let lcgenka: number = 0;
    switch (this.frmArr.getRawValue()[i]['mtax']) {
      case '0':
        lctaxmoney = Math.round(ctrl.tanka * lctaxrate) * ctrl.suu;
        lctoutmoney = lcmoney;
        lctinmoney = lcmoney + lctaxmoney;
        break;
      case '1':
        lctaxmoney = Math.floor(ctrl.tanka * (1 + lctaxrate)) * ctrl.suu;
        lctoutmoney = lcmoney - lctaxmoney;
        lctinmoney = lcmoney;
        break;
      case '2':
        lctaxmoney = 0;
        lctoutmoney = lcmoney;
        lctinmoney = lcmoney;
        break;
    }
    // console.log(ctrl);
    lcgenka = Math.round(ctrl.genka * ctrl.suu);
    this.frmArr.controls[i].patchValue({
      money: lcmoney,
      tgenka: lcgenka,
      taxmoney: lctaxmoney,
      toutmoney: lctoutmoney,
      tinmoney: lctinmoney
    });


    // console.log(+this.frmArr.getRawValue()[i]['pable'] - +this.frmArr.getRawValue()[i]['suu'],this.frmArr.getRawValue()[i]['spec'] == null);
    if (this.frmArr.getRawValue()[i]['pable'] == null) {
      this.frmArr.controls[i].patchValue({ spec: null });
    } else if (+this.frmArr.getRawValue()[i]['pable'] - +this.frmArr.getRawValue()[i]['suu'] >= 10 && this.frmArr.getRawValue()[i]['spec'] == null) {
      this.frmArr.controls[i].patchValue({ spec: '1' });
    } else if (+this.frmArr.getRawValue()[i]['pable'] - +this.frmArr.getRawValue()[i]['suu'] < 10 && this.frmArr.getRawValue()[i]['spec'] == null) {
      this.frmArr.controls[i].patchValue({ spec: '0' });
    }


    this.calcTot();
  }
  setAll(chked: boolean) {
    this.frmArr.controls
      .forEach(control => {
        control.patchValue({ chk: chked });
      })
    this.refresh();
  }

  setKoguchi() {
    // console.log(this.frmArr);
    let i: number = 0;
    let forDel: number[] = [];
    let calc: { [key: string]: number; } = {};
    let sour: { [key: string]: number; } = {};
    let kogu: number = 0;
    let mall: number = 0;
    let obi: number = 0;
    this.frmArr.controls.forEach(control => {
      // console.log('setKoguchi',control.value);
      if (!control.value.gcode.indexOf('Z01') || !control.value.gcode.indexOf('Z02') || control.value.gcode == 'MALL') {
        forDel.push(i);
        // console.log(control.value.gcode,i);
      } else if (control.value.gskbn == '0' || control.value.gskbn == '1') {
        if (/^CB.*SV$/.test(control.value.gcode)) {
          mall += +control.value.suu;
        } else if (control.value.koguchi) {
          if (sour[control.value.send] > 0) {
            sour[control.value.send] += +control.value.suu;
          } else {
            sour[control.value.send] = +control.value.suu;
          }
          kogu += (+control.value.koguchi * +control.value.suu);
        } else if (+control.value.max > 0) {
          if (calc[control.value.send] > 0) {
            calc[control.value.send] += (+control.value.suu / +control.value.max);
          } else {
            calc[control.value.send] = (+control.value.suu / +control.value.max);
          }
        }
        if (/^CB.*$/.test(control.value.gcode)) {
          obi += +control.value.suu;
        }		
      }
      i += 1;
    })
    forDel.reverse().forEach(fordel => {
      this.frmArr.removeAt(fordel);
    })
    // console.log(calc,sour);
    let j: number = this.memsrv.adrs.findIndex(obj => obj.eda == this.parentForm.getRawValue()['nadr']);
    if (j > -1) {
      let sufi: string = "";
      // console.log(this.parentForm.value,j);
      if (!this.memsrv.adrs[j].region.indexOf('北海道')) {
        sufi = '-01';
      } else if (!this.memsrv.adrs[j].region.indexOf('沖縄県')) {
        sufi = '-47';
      }
      for (let kbn in calc) {
        kogu += Math.ceil(calc[kbn]);
        if (sour[kbn] > 0) {
          sour[kbn] += Math.ceil(calc[kbn]);
        } else {
          sour[kbn] = Math.ceil(calc[kbn]);
        }
      }
      for (let kbn in sour) {
        let lcgcd: string;
        if (kbn == 'null') {
          lcgcd = 'Z01' + sufi;
        } else {
          lcgcd = 'Z01' + '-' + kbn + sufi;
        }
        this.insRows([lcgcd + "\t" + sour[kbn]], false);
      }
      if (this.parentForm.value.pcode == '9') {
        this.insRows(["Z02" + "\t" + "1"], false);
      }
      if (mall > 0) {
        this.insRows(["MALL" + "\t" + mall], false);
      }
    }
    this.autoFil();
    this.parentForm.get('okurisuu').setValue(kogu);
  }

  async setJmeikbn(kbn: string) {
    let i: number = 0;
    // console.log(kbn);
    if (this.parentForm.value.jdstatus == null) {
      this.parentForm.get('jdstatus').setValue("0");
    }
    this.frmArr.controls
      .forEach(control => {
        if (control.value.chk) {
          // console.log(control.value);
          control.patchValue({ spec: kbn });
          i += 1;
          if (kbn == "3" && this.hatden.indexOf(control.value.vcode) == -1) {
            this.hatden.push(control.value.vcode);
          } else if (kbn == "6" && this.movden.indexOf(control.value.scode) == -1) {
            this.movden.push(control.value.scode);
          }
        }
      })
    this.refresh();
    this.usrsrv.toastInf(i + '件変更しました。まだ、保存されていません。');
  }

  async toFrmsup() {
    //仕入先１件分の処理
    this.jmisrv.denno = await this.jmisrv.getDenno();
    let hdno = await this.usrsrv.getNumber('hdenno', 1);
    let jmei = [];
    this.frmArr.controls
      .forEach(control => {
        // console.log(control,this.hatden[0]);
        // console.log(control.get('spec').value=="3",control);
        if (control.get('spec').value == "3" && control.get('vcode').value == this.hatden[0]) {
          jmei.push(control.value.gcode + "\t" + control.value.suu + "\t"
            + this.jmisrv.denno + "\t" + control.get('line').value);
          control.patchValue({ spdet: hdno });
        }
      })
    localStorage.setItem(this.jmisrv.denno + 'MWSYS_FRMSUPPLY',
      JSON.stringify({
        vcd: this.hatden[0],
        mei: jmei
      }));
    this.usrsrv.openFrmCre('/frmsupply', hdno, this.jmisrv.denno + 'MWSYS_FRMSUPPLY');
    this.hatden.shift();
  }

  async toFrmmov() {
    this.jmisrv.denno = await this.jmisrv.getDenno();
    let mdno = await this.usrsrv.getNumber('mdenno', 1);
    let jmei = [];
    this.frmArr.controls
      .forEach(control => {
        // console.log(control,this.hatden[0]);
        // console.log(control.get('spec').value=="3",control);
        if (control.get('spec').value == "6" && control.value.scode == this.movden[0]) {
          jmei.push(control.value.gcode + "\t" + control.value.suu + "\t"
            + this.jmisrv.denno + "\t" + control.get('line').value);
          control.patchValue({ spdet: mdno });
        }
      })
    localStorage.setItem(this.jmisrv.denno + 'MWSYS_FRMMOVE',
      JSON.stringify({
        outcode: this.parentForm.value.scode,
        incode: this.movden[0],
        mei: jmei
      }));
    this.usrsrv.openFrmCre('/frmmove', mdno, this.jmisrv.denno + 'MWSYS_FRMMOVE');
    this.movden.shift();
  }


  delRow(row: number) {
    this.frmArr.removeAt(row);
    this.autoFil();
  }
  insRow(flgCP: boolean, row: number) {
    // console.log(flgCP, row);
    if (flgCP) {
      this.frmArr.insert(row, this.createRow(row, this.frmArr.controls[row - 1].value));
    } else {
      this.frmArr.insert(row, this.createRow(row));
    }
    this.autoFil();
  }
  autoFil() {
    let i: number = 0;
    this.frmArr.controls
      .forEach(control => {
        control.patchValue({ line: i + 1 });
        i = i + 1;
      })

    this.calcTot();
  }
  addRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.frmArr.push(this.createRow(i + 1));
    }
    this.refresh();
  }
  createRow(i: number, jyumei?: mwI.Jyumei) {
    // console.log('createRow',i,jyumei);
    let lcArr: FormArray = this.fb.array([]);
    let lcAr2: FormArray = this.fb.array([]);
    if (jyumei?.gskbn == "0" || jyumei?.gskbn == "1") { //数量区分"0：在庫品"または、"1：セット品"の場合
      jyumei.msgzais.forEach(e => {
        if (e.msgoods.gskbn == "0") { //数量区分"0：在庫品"の場合
          lcArr.push(this.fb.group({ zcode: e.zcode, irisu: e.irisu, msgoods: e.msgoods }));
          // lcAr2.push({eda:i,gcode:e.zcode,suu:e.irisu*jyumei?.suu,spec:null,spdet:null});
        }
      });
      jyumei.trjyumzais.forEach(e => {
        lcAr2.push(this.fb.group(e));
      });
    }
    return this.fb.group({
      chk: [''],
      line: [{ value: i, disabled: true }],
      gcode: [jyumei?.gcode, Validators.required],
      gtext: [jyumei?.gtext],
      suu: [jyumei?.suu],
      unit: [jyumei?.unit],
      tanka: [jyumei?.tanka],
      toutmoney: [{ value: jyumei?.toutmoney, disabled: true }],
      tinmoney: [{ value: jyumei?.tinmoney, disabled: true }],
      mmemo: [jyumei?.mmemo],
      spec: [jyumei?.spec],
      spdet: [jyumei?.spdet],
      pable: [{ value: jyumei?.pable, disabled: true }],
      genka: [jyumei?.genka],
      scode: [jyumei?.scode],
      sday: [jyumei?.sday],
      tanka1: [{ value: jyumei?.tanka1, disabled: true }],
      money: [{ value: jyumei?.money, disabled: true }],
      mtax: [jyumei?.mtax],
      tgenka: [{ value: jyumei?.tgenka, disabled: true }],
      taxmoney: [jyumei?.taxmoney],
      taxrate: [jyumei?.taxrate],
      currency: [jyumei?.currency],
      gskbn: [jyumei?.gskbn],
      max: [jyumei?.max],
      koguchi: [jyumei?.koguchi],
      ordering: [jyumei?.ordering],
      send: [jyumei?.send],
      vcode: [jyumei?.vcode],
      gkbn: [jyumei?.gkbn],
      code: [jyumei?.code],
      hgcode: [jyumei?.hgcode],
      tanano: [jyumei?.tanano],
      msgzais: lcArr,
      trjyumzais: lcAr2
    });

  }

  gcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.data = {
      gcode: this.frmArr.controls[i].value.gcode,
      tkbn: ['0']
    };
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.updGds(i, data.gcode);

        }
      }
    );
  }
  spdetHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    let gcd: string = "";
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    if (this.frmArr.controls[i].value.spec == "8") {
      gcd = this.frmArr.controls[i].value.gcode;
    } else if (this.frmArr.controls[i].value.spec == "9") {
      gcd = this.frmArr.controls[i].value.hgcode
      console.log(gcd);
      if (gcd == undefined) {
        this.usrsrv.toastWar("加工前品番が商品マスタに登録されていません");
        return void (0);
      }
    } else {
      return void (0);
    }
    // dialogConfig.panelClass= 'full-screen-modal';
    this.apollo.watchQuery<any>({
      query: Query.GetTran,
      variables: {
        id: this.usrsrv.compid,
        gcd: gcd
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        console.log(data);
        if (data.vnymat.length == 0) {
          this.usrsrv.toastWar("入荷予定が見つかりません");
        } else {
          dialogConfig.data = {
            nymat: data.vnymat,
            suu: this.frmArr.controls[i].value.suu
          };
          let dialogRef = this.dialog.open(SpdethelpComponent, dialogConfig);

          dialogRef.afterClosed().subscribe(
            data => {
              if (typeof data != 'undefined') {
                // console.log(data,data.denno || '_' || data.line);
                // this.frmArr.controls[i].get('spec').setValue('8');
                this.frmArr.controls[i].get('spdet').setValue(data.denno + '_' + data.line);
              }
            }
          );
        }
      });
  }
  jyumZai(i: number): void {
    let dialogConfig = new MatDialogConfig();
    let lcdata = [];
    // console.log('jyumZai',this.getMtbl(i,'trjyumzais'),this.frmArr.controls[i].get('trjyumzais'));
    this.getMtbl(i, 'trjyumzais').controls.forEach(e => {
      let j: number = this.setZai[i].findIndex(obj => obj.gcode == e.value.gcode);
      if (j > -1) {
        lcdata.push({ eda: e.value.eda, gcode: e.value.gcode, suu: e.value.suu, spec: e.value.spec, spdet: e.value.spdet, pable: (this.setZai[i][j]?.stock - this.setZai[i][j]?.hikat - this.setZai[i][j]?.keepd) });
      }
    });

    // console.log(lcdata);
    dialogConfig.data = {
      tbldata: lcdata,
      scode: this.frmArr.controls[i].value.scode
    };
    let dialogRef = this.dialog.open(JmzaitblComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          // console.log(data);
          this.getMtbl(i, 'trjyumzais').clear();
          data.forEach(e => this.getMtbl(i, 'trjyumzais').push(this.fb.group(e)));

        }
      }
    );
  }
  updGds(i: number, value: string): void {
    let val: string = this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('gcode').setValue(val);
    this.apollo.watchQuery<any>({
      query: Query.GetGood,
      variables: {
        id: this.usrsrv.compid,
        gds: val,
        day: this.parentForm.value.day,
        mcd: this.parentForm.value.mcode,
        sptnk: this.jmisrv.sptnkbn
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
		// console.log(data);  
        let msgds = data.msgoods_by_pk;
        if (msgds == null) {
          this.usrsrv.toastWar("商品コード" + val + "は登録されていません");
          this.frmArr.controls[i].get('gcode').setErrors({ 'incorrect': true });
        } else {
          this.frmArr.controls[i].get('gcode').setErrors(null);
          this.frmArr.controls[i].patchValue(msgds);
          this.frmArr.controls[i].patchValue(msgds.msggroup);
          this.frmArr.controls[i].patchValue(msgds.msgtankas[0]);
          this.frmArr.controls[i].patchValue({ scode: this.parentForm.value.scode });
          let lctanka: number = 0;
          let lcgenka: number = 0;
          // console.log(msgds.msgtankas[0], this.usrsrv.system.currate);
          if (msgds.msgtankas[0].currency == "USD") {
            lcgenka = Math.round((msgds.msgtankas[0].genka) * this.usrsrv.system.currate);
            // lcgenka = Math.round((msgds.msgtankas[0].genka) * this.usrsrv.system.currate) + msgds.msgtankas[0].cost;
          } else {
            lcgenka = msgds.msgtankas[0].genka;
            // lcgenka = msgds.msgtankas[0].genka + msgds.msgtankas[0].cost;
          }
		  let j: number = -1;
		  if ( msgds.msgtankas.length === 0) {

		  }	else {
		    j = msgds.msgsptnks.findIndex(obj => obj.sptnkbn == this.jmisrv.sptnkbn)
		  }		
		  // console.log(msgds.msgsptnks,this.jmisrv.sptnkbn,j);
          if (j > -1) {
            lctanka = msgds.msgsptnks[j].sptanka;
          } else {
            lctanka = msgds.msgtankas[0]['tanka' + this.jmisrv.tankakbn];
          }
          // console.log(i, lctanka);
          this.frmArr.controls[i].patchValue({
            mtax: this.jmisrv.mtax,
            tanka1: msgds.msgtankas[0]['tanka1'],
            tanka: lctanka,
            genka: lcgenka
          });
          if (msgds.ordering) {
            this.frmArr.controls[i].patchValue({ spec: '3' });
            if (this.hatden.indexOf(msgds.msggroup.vcode) == -1) {
              this.hatden.push(msgds.msggroup.vcode);
            }
            // } else { 
            // 加工品かどうか判定
            // let msgds.msgstit.forEach(e => {

            // });

          }
          msgds.msgzais.forEach(e => {
            let k: number = 0;
            let arr = []
            if (e.msgoods.gskbn == "0") {
              this.getMtbl(i, 'msgzais').push(this.fb.group({ zcode: e.zcode, irisu: e.irisu }));
              k = +1;
              this.getMtbl(i, 'trjyumzais').push(this.fb.group({ eda: k, gcode: e.zcode, suu: e.irisu, spec: null, spdet: null }));
            }
          });
          // console.log(this.getMtbl(i,'msgzais'),this.getMtbl(i,'trjyumzais'));
          this.setPable(i, val, msgds.msgzais);
          this.calcMei(i);
          // if (val.match(/KD2/)) {
          //   this.frmArr.controls[i].patchValue({ mbikou: '純白' });
          // } else if (val.match(/KU13.*-k/)) {
          //   this.frmArr.controls[i].patchValue({ mbikou: '極真生成' });
          // } else if (val.match(/KU9.*-k/)) {
          //   this.frmArr.controls[i].patchValue({ mbikou: '極真純白' });
          // }
          // this.calcTot();
          // this.jmisrv.subject.complete();
        }
        // console.log(this.frmArr);
        this.jmisrv.subject.next(true);
      }, (error) => {
        console.log('error query get_good', error);
      });
  }

  setPable(i: number, gcd: string, msgzais: any) {
    // console.log(gcd, this.frmArr.controls[i].value.gskbn);
    this.frmArr.controls[i].patchValue({ pable: null });
    this.jmisrv.subject.next(true);
    if (this.frmArr.controls[i].value.gskbn == "0") {
      this.stcsrv.getStock(gcd, this.frmArr.controls[i].value.gskbn, this.frmArr.controls[i].value.scode).then(result => {
        // console.log(result);
        let lcpable = (result[0]?.stock - result[0]?.hikat - result[0]?.keepd) || 0;
        this.frmArr.controls[i].patchValue({ pable: lcpable });
        if (lcpable > 0 && this.frmArr.getRawValue()[i]['spec'] == '3') {
          this.usrsrv.toastWar('品番' + gcd + 'は受発注商品ですが、受注可能数が' + lcpable + 'です');
        } else if (lcpable < 10 && (this.frmArr.getRawValue()[i]['spec'] == null || this.frmArr.getRawValue()[i]['spec'] == '0')) {
          this.usrsrv.toastWar('品番' + gcd + 'の受注可能数が' + lcpable + 'です');
        }
        this.calcMei(i);
        if (this.frmArr.getRawValue()[i]['spec'] == null) {
          this.frmArr.controls[i].get('spec').setErrors({ 'required': true });
        }
        this.jmisrv.subject.next(true);
      });
    } else if (this.frmArr.controls[i].value.gskbn == "1") {
      this.stcsrv.getSetZai(this.frmArr.controls[i].value.scode, msgzais).then(result => {
        this.setZai[i] = result;
        let lcpable = this.stcsrv.getPaabl(result);
        this.frmArr.controls[i].patchValue({ pable: lcpable });
        if (lcpable > 10 && this.frmArr.getRawValue()[i]['spec'] == null) {
          this.frmArr.controls[i].patchValue({ spec: '1' });
        } else if (lcpable < 10 && this.frmArr.getRawValue()[i]['spec'] == null) {
          this.usrsrv.toastWar('品番' + gcd + 'の受注可能数が' + lcpable + 'です');
        }
        this.calcMei(i);
        if (this.frmArr.getRawValue()[i]['spec'] == null) {
          this.frmArr.controls[i].get('spec').setErrors({ 'required': true });
        }
        this.jmisrv.subject.next(true);
      });
    }
  }

  changeSpec(i: number) {
    if (this.frmArr.getRawValue()[i]['spec'] == null) {
      this.frmArr.controls[i].get('spec').setErrors({ 'required': true });
    } else {
      this.frmArr.controls[i].get('spec').setErrors(null);
    }
  }
  changeTax(i: number, value: number) {
    const lcmoney: number = this.frmArr.controls[i].value.suu * this.frmArr.controls[i].value.tanka;
    if (this.frmArr.getRawValue()[i]['mtax'] == "0") {
      this.frmArr.controls[i].patchValue({ tinmoney: (lcmoney + value) });
    }
  }
  get frmArr(): FormArray {
    return this.parentForm.get('mtbl') as FormArray;
  }

  getMtbl(i: number, fnm: string): FormArray {
    return this.frmArr.controls[i].get(fnm) as FormArray;
  }

  toggleCols() {
    // console.log(this.flgCol,this.displayedColumns);
    if (this.flgCol) {
      this.displayedColumns = this.defCol;
      this.flgCol = false;

    } else {
      this.displayedColumns = this.defCol.concat(this.addCol);
      this.flgCol = true;
    }
    this.refresh();
  }

  frmVal(i: number, fld: string): string {
    return this.frmArr.getRawValue()[i][fld];
  }

  pasteFromClipboard(flg: boolean) {
    // if(navigator.clipboard){
    navigator.clipboard.readText()
      .then((text) => {
        // console.log(text);
        let rowData = text.split("\n");
        this.insRows(rowData, flg);
        // console.log(this.frmArr.length);
        this.parentForm.markAsDirty();
      });
    // }
  }
  insRows(rowData, flg: boolean) { //true:洗い替え、false：追加
    let i: number = 0;
    if (flg) {
      this.frmArr.clear();
    } else {
      i = this.frmArr.length;
    }
    rowData.forEach(row => {
      let col = row.split("\t");
      // console.log(col,row);
      if (col[0] != "") {
        let jmei: mwI.Jyumei = {
          line: i,
          gcode: col[0],
          gtext: '',
          suu: +col[1],
          unit: null,
          tanka: (col[2] ?? +col[2]),
          toutmoney: 0,
          tinmoney: 0,
          mmemo: null,
          spec: null,
          spdet: null,
          pable: 0,
          genka: 0,
          scode: this.parentForm.get('scode').value,
          sday: null,
          tanka1: 0,
          money: 0,
          mtax: null,
          tgenka: 0,
          taxmoney: 0,
          taxrate: null,
          currency: null,
          gskbn: null,
          max: null,
          koguchi: null,
          ordering: null,
          send: null,
          vcode: null,
          gkbn: null,
          code: null,
          hgcode: null,
          tanano: null,
          msgzais: [],
          trjyumzais: []
        }
        this.frmArr.push(this.createRow(i + 1, jmei));
        this.updGds(i, col[0]);
        i += 1;
      };
    });
    this.refresh();
  }
  copyData() {
    this.copyToClipboard = this.objectToArray(this.defCol.concat(this.addCol));
    this.frmArr.getRawValue().forEach(row => {
      if (row.gcode !== '') {
        this.copyToClipboard += this.objectToArray(row);
      }
    })
    this.usrsrv.toastInf('明細をクリップボードにコピーしました');
  }

  objectToArray(obj: object): string {
    var result = Object.keys(obj).map((key: keyof typeof obj) => {
      let value = obj[key];
      // console.log(value)
      return value;
    });
    // console.log(result.toString())
    return result.toString() + "\n";
  }
  refresh(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.data = this.frmArr.controls;
    this.jmisrv.subject.next(true);
    // console.log(this.frmArr.controls);
  }

  setJyumei(data) { //skbn:受注伝票出荷区分
    this.frmArr.clear();
    // this.jyumei = [];
    this.jmisrv.trzaiko = [];
    let i: number = 0;

    data.trjyumeis.forEach(element => {
      // console.log(element);
      let { msgood, ...rest } = element;
      let { msggroup, ...rest2 } = msgood;
      // this.jyumei.push({ ...msggroup, ...rest, ...rest2 });
      // });


      // // console.log(this.jmisrv.jyumei);
      // this.jyumei.forEach(e => {
      //   console.log(e);
      let e = { ...msggroup, ...rest, ...rest2 };
      this.frmArr.push(this.createRow(i + 1, e));
      this.setPable(i, e.gcode, e.msgzais);
      i += 1;
      //trzaikoテーブル取り消し用データ作成
      if (data.skbn != "1") {
        if (e.sday != null) {
          e.trjyumzais.forEach(zai => {
            const lczai: mwI.Zaiko = {
              scode: e.scode,
              gcode: zai.gcode,
              day: e.sday,
              suu: zai.suu * -1
            }
            this.jmisrv.trzaiko.push(lczai);
          });
        }
      }
    });
    this.refresh();
  }

  addNewrow(i: number) {
    this.gcdInps.changes.pipe(take(1)).subscribe({  //最後に更新されたformArray内の項目にフォーカスを当てる
      next: changes => {
        changes.last.nativeElement.focus()
      }
    })
    if (i + 1 == this.frmArr.length) {
      this.frmArr.push(this.createRow(i + 2));
    }
    this.refresh();
  }
  getIdx(index: number) {
    if (this.paginator) {
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else {
      return index;
    }
    // console.log(index);
  }
  getKkrt(i: number): number {
    const lcteika: number = +this.frmArr.getRawValue()[i]['tanka1'];
    const lctanka: number = +this.frmArr.getRawValue()[i]['tanka'];
    const lctaxrate: number = +this.frmArr.getRawValue()[i]['taxrate'] / 100;
    switch (this.frmArr.getRawValue()[i]['mtax']) {
      case '0':
        return ((lctanka * (1 + lctaxrate)) / lcteika);
        break;
      case '1':
        return (lctanka / lcteika);
        break;
      case '2':
        return ((lctanka * (1 + lctaxrate)) / lcteika);
        break;
    }

  }
  editJyumei(dno) {
    this.jmisrv.trjyumei = [];
    this.jmisrv.trjmzai = [];
    this.frmArr.controls
      .forEach(control => {
        this.jmisrv.trjyumei.push({
          id: this.usrsrv.compid,
          denno: dno,
          line: this.usrsrv.editFrmval(control, 'line'),
          gcode: this.usrsrv.editFrmval(control, 'gcode'),
          gtext: this.usrsrv.editFrmval(control, 'gtext'),
          suu: this.usrsrv.editFrmval(control, 'suu'),
          tanka: this.usrsrv.editFrmval(control, 'tanka'),
          toutmoney: this.usrsrv.editFrmval(control, 'toutmoney'),
          tinmoney: this.usrsrv.editFrmval(control, 'tinmoney'),
          mmemo: this.usrsrv.editFrmval(control, 'mmemo'),
          spec: this.usrsrv.editFrmval(control, 'spec'),
          spdet: this.usrsrv.editFrmval(control, 'spdet'),
          genka: this.usrsrv.editFrmval(control, 'genka'),
          scode: this.usrsrv.editFrmval(control, 'scode'),
          sday: this.usrsrv.editFrmday(control, 'sday'),
          tanka1: this.usrsrv.editFrmval(control, 'tanka1'),
          money: this.usrsrv.editFrmval(control, 'money'),
          mtax: this.usrsrv.editFrmval(control, 'mtax'),
          tgenka: this.usrsrv.editFrmval(control, 'tgenka'),
          taxmoney: this.usrsrv.editFrmval(control, 'taxmoney'),
          taxrate: this.usrsrv.editFrmval(control, 'taxrate'),
          gskbn: this.usrsrv.editFrmval(control, 'gskbn'),
          currency: this.usrsrv.editFrmval(control, 'currency')
        });
		let lceda:number = 0;
        control.value.msgzais.forEach(e => {
   	      let lcsuu:number =  control.value.suu * e.irisu; 
          lceda = ++1;
		  this.jmisrv.trjmzai.push({
            id: this.usrsrv.compid,
            denno: dno,
            line: this.usrsrv.editFrmval(control, 'line'),
            eda: lceda,
            gcode: this.usrsrv.editFrmval(e, 'zcode'),
            suu: lcsuu,
            spec: this.usrsrv.editFrmval(control, 'spec'),
            spdet: this.usrsrv.editFrmval(control, 'spdet')
          });			
        })
        // (control.get('trjyumzais') as FormArray).controls.forEach(e => {
	      // console.log('editJyumei trjyumei', control,control.value.msgzais);
		  // console.log('editJyumei trjmzai',control.value.suu,e.value.gcode);
		  // let j: number = control.value.msgzais.findIndex(obj => obj.zcode == e.value.gcode);

		  // console.log('findindex',e,j,control.value.mszais[j]);
		  // let lcsuu:number =  control.value.suu * control.value.mszais[j].irisu; 		  
          // this.jmisrv.trjmzai.push({
            // id: this.usrsrv.compid,
            // denno: dno,
            // line: this.usrsrv.editFrmval(control, 'line'),
            // eda: this.usrsrv.editFrmval(control, 'eda'),
            // gcode: this.usrsrv.editFrmval(e, 'gcode'),
            // suu: lcsuu,
            // spec: this.usrsrv.editFrmval(control, 'spec'),
            // spdet: this.usrsrv.editFrmval(control, 'spdet')
          // });
        // })

      });
	console.log('editJyumei',this.jmisrv.trjmzai);
  }

}
