import { Component, OnInit, Input, ViewChild, ViewChildren, QueryList, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { SoukoService } from './../services/souko.service';
import { GoodsService } from './../services/goods.service';
import { EdaService } from './../share/adreda/eda.service';
import { JyumeiService } from './jyumei.service';
import { Apollo } from 'apollo-angular';
import * as Query from './queries.frms';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-jmeitbl',
  templateUrl: './jmeitbl.component.html',
  styleUrls: ['./jmeitbl.component.scss'],
  changeDetection:ChangeDetectionStrategy.OnPush
})
export class JmeitblComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  @ViewChildren('gcdInputs') gcdInps: QueryList<ElementRef>;
  private el: HTMLInputElement;
  dataSource = new MatTableDataSource();
  copyToClipboard:string;
  navCli=navigator.clipboard;
  jmeikbn:string;
  hatden=[];
  mall:boolean=false;
  hidx=20; //tabindex用ヘッダ項目数
  mcols=4; //tabindex用明細列数
  displayedColumns = ['chk',
                      'line',
                      'gcode',
                      'gtext',
                      'suu',
                      'unit',
                      'rate',
                      'tanka',
                      // 'tintanka',
                      // 'touttanka',
                      'tinmoney',
                      // 'toutmoney',
                      'spec',
                      'spdet',
                      'mbikou',
                      'zaiko',
                      'jyuzan',
                      'genka',
                      'souko',
                      'tanka1',
                      'money',
                      'mtax',
                      'taxmoney',
                      'taxrate'];

  constructor(private cdRef:ChangeDetectorRef,
              private elementRef: ElementRef,
              private dialog: MatDialog,
              private fb:     FormBuilder,
              private apollo: Apollo,
              private toastr: ToastrService,
              public usrsrv: UserService,
              public bunsrv: BunruiService,
              public soksrv: SoukoService,
              public gdssrv: GoodsService,
              public edasrv: EdaService,
              public jmisrv: JyumeiService) {}

  ngOnInit(): void {
    this.add_rows(1);
    this.refresh();
    // console.log(this.parentForm);
  }

  calcTot(){
    // let lcgtotal:number=0;
    // let lcsouryou:number=0;
    // let lctesuu:number=0;
    // let lcnebiki:number=0;
    // let lcttotal:number=0;
    // let lctax:number=0;
    // let lcsyoukei:number=0;
    // let lctotal:number=0;
    // let lcuttotal:number=0;
    // let lcutax:number=0;
    // let lchttotal:number=0;
    let lcgtotalzn:number=0;
    let lcsouryouzn:number=0;
    let lctesuuzn:number=0;
    let lcnebikizn:number=0;
    let lctaxtotal:number=0;
    let lcgenka:number=0;
    // let lchgenka:number=0;
    // let lcegenka:number=0;

    this.frmArr.controls
      .forEach(control => {
        switch (control.value.gkbn) {
          case '0' :
            lcgtotalzn += control.value.tinmoney;
          　break;
          case '1' :
            lcsouryouzn += control.value.tinmoney;
          　break;
          case '2' :
            lctesuuzn += control.value.tinmoney;
          　break;     
          case '3' :
            lcnebikizn += control.value.tinmoney;
          　break;     
        }
        lctaxtotal += control.value.taxmoney; 
        lcgenka += control.value.genka;
      })
    // lctotal =  lcgtotalzn + lcsouryouzn + lctesuuzn + lcnebikizn + lctaxtotal;
    this.parentForm.patchValue({gtotalzn:lcgtotalzn,
                                souryouzn:lcsouryouzn,
                                tesuuzn:lctesuuzn,
                                nebikizn:lcnebikizn,
                                taxtotal:lctaxtotal,
                                // total:lctotal,
                                genka:lcgenka});
    this.jmisrv.subject.next(true);
    this.jmisrv.subject.complete();
    this.refresh();
    // console.log(this.frmArr,this.parentForm);
  }
  calcMei(i: number):void {
    const lcmoney:number = this.frmArr.controls[i].value.tanka * this.frmArr.controls[i].value.suu;
    const lctaxrate:number = +this.frmArr.getRawValue()[i]['taxrate'] / 100;
    let lctaxmoney:number=0;
    let lctoutmoney:number=0;
    let lctinmoney:number=0;
    let lcgenka:number=0;
    switch (this.frmArr.getRawValue()[i]['mtax']) {
      case '0' :
        lctaxmoney = Math.round(this.frmArr.controls[i].value.tanka * lctaxrate) * this.frmArr.controls[i].value.suu;
        lctoutmoney = lcmoney;  
        lctinmoney = lcmoney + lctaxmoney;
      　break;
      case '1' :
        lctaxmoney = Math.floor(this.frmArr.controls[i].value.tanka * (1 + lctaxrate)) * this.frmArr.controls[i].value.suu;
        lctinmoney = lcmoney;
        lctoutmoney = lcmoney - lctaxmoney;  
      　break;
      case '2' :
        lctaxmoney=0;
        lctoutmoney = lcmoney;
        lctinmoney = lcmoney;
      　break;     
    }
    lcgenka = Math.round(this.frmArr.controls[i].value.genka * this.frmArr.controls[i].value.suu);
    this.frmArr.controls[i].patchValue({
      money:lcmoney,
      genka:lcgenka,
      taxmoney:lctaxmoney,
      toutmoney:lctoutmoney,
      tinmoney:lctinmoney
    });

  }
  setAll(chked:boolean){
    this.frmArr.controls
      .forEach(control => {
        control.patchValue({chk:chked});
      })
    this.refresh();
  }

  setKoguchi(){
    // console.log(this.frmArr);
    let i:number=0;
    let forDel:number[]=[];
    let calc:{ [key: string]: number; } = {};
    let sour:{ [key: string]: number; } = {};
    let kogu:number = 0;
    this.frmArr.controls.forEach(control => {
      // console.log(control.value.gcode,i);
      if(!control.value.gcode.indexOf('Z01') || !control.value.gcode.indexOf('Z02')){
        forDel.push(i);
        // console.log(control.value.gcode,i);
      } else if (control.value.zkbn=='0'){
        if(control.value.koguchi){
          if (sour[control.value.send]>0){
            sour[control.value.send] += +control.value.suu; 
          } else{
            sour[control.value.send] = +control.value.suu; 
          }
          kogu += (+control.value.koguchi * +control.value.suu);
        }else if (+control.value.max > 0){
          if(calc[control.value.send]>0){
            calc[control.value.send] += (+control.value.suu / +control.value.max);
          } else {
            calc[control.value.send] = (+control.value.suu / +control.value.max);
          }
        }
      }
      i += 1;
    })
    forDel.reverse().forEach(fordel => {
      this.frmArr.removeAt(fordel);
    })
    console.log(calc,sour);
    let j:number = this.edasrv.adrs.findIndex(obj => obj.eda == this.parentForm.value.nadr);
    let sufi:string="";
    if(this.edasrv.adrs[j].region=='北海道'){
      sufi='-01';
    } else if (this.edasrv.adrs[j].region=='沖縄県'){
      sufi='-47';
    }
    for (let kbn in calc) {
       kogu += Math.ceil(calc[kbn]);
       if(sour[kbn]>0){
         sour[kbn] += Math.ceil(calc[kbn]);
       } else {
         sour[kbn] = Math.ceil(calc[kbn]);
       }
    }
    for (let kbn in sour) {
      let lcgcd:string;
      if (kbn=='null'){
        lcgcd = 'Z01' + sufi;
      } else {
        lcgcd = 'Z01' + '-' + kbn + sufi;
      }
      this.insRows([lcgcd + "\t" + sour[kbn]],false);
    }
    if( this.parentForm.value.pcode=='9'){
      this.insRows(["Z02" + "\t" + "1"],false);
    }

    this.auto_fil();
    this.parentForm.get('okurisuu').setValue(kogu);
  }

  async setJmeikbn(kbn:string){
    let i:number=0;
    // console.log(kbn);
    if (this.parentForm.value.jdstatus==null){
      this.parentForm.get('jdstatus').setValue("0");
    }
    this.frmArr.controls
      .forEach(control => {
        if(control.value.chk){
          // console.log(control.value);
          control.patchValue({spec:kbn});
          i+=1;
          if(kbn=="3" && this.hatden.indexOf(control.value.vcode) == -1){
            this.hatden.push(control.value.vcode);
          }
        }
      })
    this.refresh();
    this.toastr.info(i + '件変更しました。まだ、保存されていません。');
  }

　async toFrmsup() {
    this.jmisrv.denno = await this.jmisrv.get_denno();
    let hdno = await this.usrsrv.getNumber('hdenno',1);
    let jmei=[];
    this.frmArr.controls
      .forEach(control => {
          // console.log(control,this.hatden[0]);
        console.log(control.get('spec').value=="3",control);
        if(control.get('spec').value=="3" && control.get('vcode').value==this.hatden[0]){
          jmei.push(control.value.gcode + "\t" + control.value.suu + "\t" 
                    + this.jmisrv.denno + "\t" + control.get('line').value);
          control.patchValue({spdet:hdno});        
        }
      })  
    localStorage.setItem(this.jmisrv.denno + 'MWSYS_FRMSUPPLY', 
                         JSON.stringify({vcd:this.hatden[0],
                                         mei:jmei}));
    this.usrsrv.openFrmsup(hdno,this.jmisrv.denno + 'MWSYS_FRMSUPPLY');
    this.hatden.shift();
  }

  del_row(row:number){
    this.frmArr.removeAt(row);
    this.auto_fil();  
  }
  ins_row(row:number){
    this.frmArr.insert(row,this.createRow(row));
    this.auto_fil();  
  }
  auto_fil(){
    let i:number=0;
    this.frmArr.controls
      .forEach(control => {
        control.patchValue({line:i+1});
        i=i+1;
      })
    this.refresh();
  }
  add_rows(rows:number){
    for (let i=0;i<rows;i++){
      this.frmArr.push(this.createRow(i+1));
    }
    this.refresh();
  }
  createRow(i:number,jyumei?:mwI.Jyumei){
    return this.fb.group({
      chk:[''],
      line:[{value:i,disabled:true}],
      sday:[jyumei?.sday],
      souko:[jyumei?.souko],
      gcode:[jyumei?.gcode, Validators.required],
      gtext:[jyumei?.gtext],
      suu:[jyumei?.suu],
      unit:[jyumei?.unit],
      tanka1:[{value:jyumei?.tanka1,disabled:true}],
      tanka:[jyumei?.tanka],
      money:[{value:jyumei?.money,disabled:true}],
      mtax:[jyumei?.mtax],
      mbikou:[jyumei?.mbikou],
      zaiko:[{value:jyumei?.zaiko,disabled:true}],
      jyuzan:[{value:jyumei?.jyuzan,disabled:true}],
      genka:[jyumei?.genka],
      spec:[jyumei?.spec],
      tintanka:[jyumei?.tintanka],
      touttanka:[jyumei?.touttanka],
      taxtanka:[jyumei?.taxtanka],
      tinmoney:[{value:jyumei?.tinmoney,disabled:true}],
      toutmoney:[jyumei?.toutmoney],
      taxmoney:[jyumei?.taxmoney],
      taxrate:[jyumei?.taxrate],
      code:[jyumei?.code],
      gkbn:[jyumei?.gkbn],
      zkbn:[jyumei?.zkbn],
      spdet:[jyumei?.spdet],
      ordering:[jyumei?.ordering],
      vcode:[jyumei?.vcode],
      max:[jyumei?.max],
      send:[jyumei?.send], 
      koguchi:[jyumei?.koguchi],
      msgzais:this.fb.array([])   
    });
  }
 
  gcdHelp(i: number): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width  = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass= 'full-screen-modal';
    let dialogRef = this.dialog.open(GcdhelpComponent, dialogConfig);
    
    dialogRef.afterClosed().subscribe(
      data=>{
          if(typeof data != 'undefined'){
            this.updGds(i,data.gcode);

          }
      }
    );
  }

  updGds(i: number,value: string):void {
    let val:string =this.usrsrv.convUpper(value);
    this.frmArr.controls[i].get('gcode').setValue(val);
    this.apollo.watchQuery<any>({
      query: Query.GetGood, 
        variables: { 
          id : this.usrsrv.compid,           
          gds: val,
          day: this.parentForm.value.day
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        let msgds = data.msgoods_by_pk;
        if(msgds == null){
          this.toastr.warning("商品コード" + val+ "は登録されていません");
          this.frmArr.controls[i].get('gcode').setErrors({'incorrect': true});
        }else{
          this.frmArr.controls[i].get('gcode').setErrors(null);
          this.frmArr.controls[i].patchValue(msgds);
          this.frmArr.controls[i].patchValue(msgds.msggroup);
          this.frmArr.controls[i].patchValue(msgds.msgtankas[0]);
          this.frmArr.controls[i].patchValue({souko:this.parentForm.value.souko});
          let lctanka:number=0;
          let lcgenka:number=0;
          console.log(value,msgds);
          if(msgds.msgtankas[0].currency=="USD"){
            lcgenka = Math.round((msgds.msgtankas[0].genka + msgds.msgtankas[0].cost) * this.usrsrv.system.currate);
          }else{
            lcgenka = msgds.msgtankas[0].genka + msgds.msgtankas[0].cost;
          }
          let j:number = msgds.msgsptnks.findIndex(obj => obj.sptnkbn == this.jmisrv.sptnkbn );
          if(j>-1){
            lctanka=msgds.msgsptnks[j].sptanka;
          }else{
            lctanka=msgds.msgtankas[0]['tanka' + this.jmisrv.tankakbn];
          }
          // console.log(this.jmisrv.souko);
          this.frmArr.controls[i].patchValue({mtax:this.jmisrv.mtax,
                                              tanka1:msgds.msgtankas[0]['tanka1'],
                                              tanka:lctanka,
                                              genka:lcgenka});
          if(msgds.ordering){
            this.frmArr.controls[i].patchValue({spec:'3'});
            if(this.hatden.indexOf(msgds.msggroup.vcode) == -1){
              this.hatden.push(msgds.msggroup.vcode);
            }
          }
          this.calcMei(i);
          this.calcTot();
          // this.jmisrv.subject.complete();
        }
        this.jmisrv.subject.next(true);
      },(error) => {
        console.log('error query get_good', error);
      });
  } 

  changeTax(i : number,value:number){
    if (this.frmArr.getRawValue()[i]['mtax']=="0") {
      const lcmoney:number = this.frmArr.controls[i].value.suu * this.frmArr.controls[i].value.tanka;
      this.frmArr.controls[i].patchValue({tinmoney:(lcmoney + value)});  
    }    
  }
  get frmArr():FormArray {    
    return this.parentForm.get('mtbl') as FormArray;
  }  
  
  frmVal(i:number,fld:string):string {
    return this.frmArr.getRawValue()[i][fld];
  }

  pasteFromClipboard(flg:boolean){
    // if(navigator.clipboard){
    navigator.clipboard.readText()
    .then((text) => {
      console.log(text);
        let rowData = text.split("\n");
        this.insRows(rowData,flg);
        this.parentForm.markAsDirty();
    });
    // }
  }
  insRows(rowData,flg:boolean){ //true:洗い替え、false：追加
    let i:number=0;
    if(flg){
      this.frmArr.clear();
    }else{
      i=this.frmArr.length;
    }
    rowData.forEach(row => {
      let col=row.split("\t");
      // console.log(col,row);
      if(col[0]!=""){
        let jmei:mwI.Jyumei= {
            line:i,
            sday:null,
            souko:this.parentForm.get('souko').value,
            gcode:col[0],
            gtext:'',
            suu:+col[1],
            unit:null,
            tanka1:0,
            tanka:(col[2] ?? +col[2]),
            money:0,
            mtax:null,
            mbikou:null,
            zaiko:0,
            jyuzan:0,
            genka:0,
            spec:null,
            tintanka:0,
            touttanka:0,
            taxtanka:0,
            tinmoney:0,
            toutmoney:0,
            taxmoney:0,
            taxrate:null,
            currency:null,
            code:null,
            gkbn:null,
            zkbn:null,
            spdet:null,
            ordering:null,
            vcode:null,
            max:null,
            send:null,
            koguchi:null,
            msgzais:[]
          } 
          this.frmArr.push(this.createRow(i+1,jmei));
          this.updGds(i,col[0]);
          i+=1;
      };
    });
    this.refresh();
  }
  copyData() {
    this.copyToClipboard = this.objectToArray(this.displayedColumns);
    this.frmArr.getRawValue().forEach(row => {
      if(row.gcode !=='' ){
        this.copyToClipboard += this.objectToArray(row);
      }
    })
    this.toastr.info('明細をクリップボードにコピーしました');
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
    this.dataSource.data =  this.frmArr.controls;
  }

  set_jyumei(){
    this.frmArr.clear();
    let i:number=0;
    this.jmisrv.jyumei.forEach(e => {
      this.frmArr.push(this.createRow(i+1,e));
      i+=1;
    });
    this.refresh();
  }

  add_newrow(i:number){
    this.gcdInps.changes.pipe(take(1)).subscribe({
      next: changes => {
        changes.last.nativeElement.focus()
        }
    })
    if (i+1 == this.frmArr.length){
      this.frmArr.push(this.createRow(i+2));
    }
    this.refresh();
  }  
  getIdx(index : number)    {
    if(this.paginator){
      return index + this.paginator.pageSize * this.paginator.pageIndex;
    } else{
      return index;
    }
  }
  getKkrt(i : number):number {
    const lcteika:number = +this.frmArr.getRawValue()[i]['tanka1'];
    const lctanka:number = +this.frmArr.getRawValue()[i]['tanka'];
    const lctaxrate:number = +this.frmArr.getRawValue()[i]['taxrate']/100;
    switch (this.frmArr.getRawValue()[i]['mtax']) {
      case '0' :
        return ((lctanka * (1 + lctaxrate)) / lcteika);
      　break;
      case '1' :
        return (lctanka/ lcteika); 
      　break;
      case '2' :
        return ((lctanka * (1 + lctaxrate)) / lcteika);
      　break;     
    }    

  }
  get_jyumei(dno){
    let jyumei=[];
    this.frmArr.controls
      .forEach(control => {
        jyumei.push({
          id: this.usrsrv.compid,
          denno:dno,
          line: this.usrsrv.editFrmval(control,'line'),
          sday: this.usrsrv.editFrmval(control,'sday'),
          souko: this.usrsrv.editFrmval(control,'souko'),
          gcode: this.usrsrv.editFrmval(control,'gcode'),
          gtext: this.usrsrv.editFrmval(control,'gtext'),
          suu: this.usrsrv.editFrmval(control,'suu'),
          tanka1: this.usrsrv.editFrmval(control,'tanka1'),
          tanka: this.usrsrv.editFrmval(control,'tanka'),
          money: this.usrsrv.editFrmval(control,'money'),
          mtax: this.usrsrv.editFrmval(control,'mtax'),
          mbikou: this.usrsrv.editFrmval(control,'mbikou'),
          genka: this.usrsrv.editFrmval(control,'genka'),
          spec: this.usrsrv.editFrmval(control,'spec'),
          // tintanka: this.usrsrv.editFrmval(control,'tintanka'),
          // touttanka: this.usrsrv.editFrmval(control,'touttanka'),
          // taxtanka: this.usrsrv.editFrmval(control,'taxtanka'),
          tinmoney: this.usrsrv.editFrmval(control,'tinmoney'),
          toutmoney: this.usrsrv.editFrmval(control,'toutmoney'),
          taxmoney: this.usrsrv.editFrmval(control,'taxmoney'),
          taxrate: this.usrsrv.editFrmval(control,'taxrate'),
          specdet: this.usrsrv.editFrmval(control,'specdet')
        });
      });
      return jyumei;
  }

}
