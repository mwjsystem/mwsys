import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, ViewEncapsulation, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { DownloadService } from './../services/download.service';
import { VendsService } from './vends.service';
// import { ToastrService } from 'ngx-toastr';
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { BeforeunloadBase } from '../beforeunload-base';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSuffix, MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { TmstmpComponent } from '../core/tmstmp/tmstmp.component';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatCheckbox } from '@angular/material/checkbox';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { MatExpansionPanel, MatExpansionPanelHeader } from '@angular/material/expansion';
import { ModetxtPipe } from '../core/pipes/modetxt.pipe';

/** get_vendor クエリの結果 */
interface VendorResult { msvendor_by_pk: mwI.Vendor & { created_at: Date; updated_at: Date; created_by: string; updated_by: string } }

@Component({
    selector: 'app-mstvendor',
    templateUrl: './mstvendor.component.html',
    styleUrls: ['./../app.component.scss'],
    encapsulation: ViewEncapsulation.None //グローバルにCSSが効く
    ,
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatButton, MatIcon, FormsModule, MatIconButton, MatSuffix, ReactiveFormsModule, MatCard, MatCardHeader, MatCardTitle, TmstmpComponent, MatCardContent, MatFormField, MatLabel, MatInput, MatSelect, MatOption, MatCheckbox, CdkTextareaAutosize, MatExpansionPanel, MatExpansionPanelHeader, ModetxtPipe]
})
export class MstvendorComponent extends BeforeunloadBase implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private title = inject(Title);
  private route = inject(ActivatedRoute);
  private elementRef = inject(ElementRef);
  private dialog = inject(MatDialog);
  usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  private dwlsrv = inject(DownloadService);
  private vensrv = inject(VendsService);
  private apollo = inject(Apollo);

  vcd!: string;
  form!: FormGroup;
  mode: number = 3;

  constructor() {
    super();
    this.title.setTitle('仕入先マスタ(MWSystem)')
  }

  ngOnInit(): void {
    this.bunsrv.getBunrui();
    this.vensrv.getVendors();
    this.form = this.fb.group({
      mtax: new FormControl(''),
      currency: new FormControl(''),
      zip: new FormControl(''),
      region: new FormControl(''),
      local: new FormControl(''),
      street: new FormControl(''),
      extend: new FormControl(''),
      tel: new FormControl(''),
      fax: new FormControl(''),
      tel2: new FormControl(''),
      tel3: new FormControl(''),
      extend2: new FormControl(''),
      adrname: new FormControl(''),
      adrbikou: new FormControl(''),
      adrinbikou: new FormControl(''),
      mail1: new FormControl(''),
      mail2: new FormControl(''),
      mail3: new FormControl(''),
      mail4: new FormControl(''),
      mail5: new FormControl(''),
      del: new FormControl(''),
      tanto: new FormControl(''),
      url: new FormControl(''),
      kana: new FormControl(''),
    });

    this.route.paramMap.subscribe((params: ParamMap) => {
      if (params.get('mode') === null) {
        this.mode = 3;
      } else {
        this.mode = Number(params.get('mode'));
      }
      this.refresh();
      const vcd = params.get('vcd');
      if (vcd !== null) {
        this.vcd = vcd;
        this.get_vendor();
      }
    });
  }
  ngAfterViewInit() {
    const script = document.createElement('script');
    script.src = "https://yubinbango.github.io/yubinbango/yubinbango.js";

    script.charset = "UTF-8";
    const div = document.getElementById('script');
    if (div === null) {
      throw new Error('スクリプトの挿入先（#script）がありません');
    }
    div.insertAdjacentElement('afterend', script);
  }

  onEnter(): void {
    this.elementRef.nativeElement.querySelector('button').focus();
    if (this.vcd) {
      this.get_vendor();
    }
  }

  vcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    dialogConfig.autoFocus = true;
    let dialogRef = this.dialog.open(VcdhelpComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.vcd = data.code;
          this.get_vendor();
        }
      }
    );
  }

  get_vendor() {
    const GetMast = gql`
    query get_vendor($id: smallint!,$vcd: String!)  {
      msvendor_by_pk( id: $id,code: $vcd) {
        code
        adrname
        kana
        mtax
        currency
        tel
        tel2
        tel3
        fax
        mail1
        mail2
        mail3
        mail4
        mail5
        tanto
        url
        del
        ftel
        zip
        region
        local
        created_at
        updated_at
        created_by
        updated_by
      }
    }`;
    this.apollo.watchQuery<VendorResult>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid,
        vcd: this.vcd
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        if (!data) {
          return;
        }
        const vendor = (data as VendorResult).msvendor_by_pk;
        this.form.patchValue(vendor);
        console.log(vendor);
        this.usrsrv.setTmstmp(vendor);
        history.replaceState('', '', './mstvendor/' + this.mode + '/' + this.vcd);
        if (this.mode == 3) {
          this.form.disable();
        } else {
          this.form.enable();
        }
      }, (error) => {
        console.log('error query get_vendor', error);
      });
  }

  modeToCre(): void {
    this.mode = 1;
    this.form.reset();
    this.refresh();
    this.vcd = "新規登録";
  }

  modeToUpd(): void {
    this.mode = 2;
    this.refresh();
    history.replaceState('', '', './mstvendor/' + this.mode + '/' + this.vcd);
  }

  save(): void {











  }

  async getAdr(event: Event) {
    this.dwlsrv.getAdr((event.target as HTMLInputElement)?.value).then(result => {
      // console.log(result, result.results)
      if (!result.results || result.results.length === 0) {
        this.usrsrv.toastWar("該当する住所が見つかりませんでした");
        return;
      }
      this.form.patchValue({
        region: result.results[0].address1,
        local: result.results[0].address2,
        street: result.results[0].address3
      });


    })
  }
  cancel(): void {
    if (this.mode == 1) {
      this.vcd = '';
    }
    this.mode = 3;
    this.refresh();
    this.form.markAsPristine();
    history.replaceState('', '', './mstvendor/' + this.mode + '/' + this.vcd);
  }

  refresh(): void {
    if (this.mode == 3) {
      this.form.disable();
    } else {
      this.form.enable();
    }
    // this.cdRef.detectChanges();
  }

}