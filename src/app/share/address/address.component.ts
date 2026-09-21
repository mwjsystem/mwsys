import { Component, OnInit, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { FormGroupDirective, FormGroup, FormControl, Validators, ControlContainer, FormArray, FormBuilder } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
import { DownloadService } from './../../services/download.service';
import { Observable, Subject } from 'rxjs';

interface AffectedRows { affected_rows: number }
/** 顧客住所（msmadr）へ渡す値。eda は住所の枝番、ftel は電話番号をまとめた表示用の値 */
type MadrInput = mwI.Adrs & { id: number; mcode: string; ftel: string };
/** get_eda クエリの結果（顧客の住所枝番の最大値） */
interface MaxEdaResult { msmadr_aggregate: { aggregate: { max: { eda: number } } } }
/** upd_madr ミューテーションの結果 */
interface UpdMadrResult { update_msmadr: AffectedRows }
/** ins_madr ミューテーションの結果 */
interface InsMadrResult { insert_msmadr: AffectedRows }
@Component({
    selector: 'app-address',
    templateUrl: './address.component.html',
    styleUrls: ['./../../help.component.scss'],
    viewProviders: [
        {
            provide: ControlContainer,
            useExisting: FormGroupDirective
        }
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AddressComponent implements OnInit {
  private parent = inject(FormGroupDirective);
  private usrsrv = inject(UserService);
  bunsrv = inject(BunruiService);
  private dwlsrv = inject(DownloadService);
  private apollo = inject(Apollo);

  readonly formName = input.required<string>();

  ngOnInit(): void {
    const form = this.parent.form;
    // if (this.formName=='addr1') {
    form.addControl(this.formName(), new FormGroup({
      zip: new FormControl(''),
      region: new FormControl(''),
      local: new FormControl(''),
      street: new FormControl(''),
      extend: new FormControl(''),
      extend2: new FormControl(''),
      adrname: new FormControl(''),
      tel: new FormControl(''),
      fax: new FormControl(''),
      tel2: new FormControl(''),
      tel3: new FormControl(''),
      nmemo: new FormControl(''),
      smemo: new FormControl(''),
      omemo: new FormControl(''),
      del: new FormControl(''),
      target: new FormControl(''),
      htitle: new FormControl('')
    }));
  }
  updTel(fldnm: string, event: Event) {
    let val: string = this.usrsrv.convTel((event.target as HTMLInputElement)?.value);
    // console.log(value,val);
    this.parent.form.get(this.formName())!.get(fldnm)!.setValue(val);
  }

  async getAdr(event: Event) {
    this.dwlsrv.getAdr((event.target as HTMLInputElement)?.value).then(result => {
      // console.log(result, result.results)
      this.parent.form.get(this.formName())!.patchValue({
        region: result.results[0].address1,
        local: result.results[0].address2,
        street: result.results[0].address3
      });
    })
  }
  saveMadr(mcode: string, eda: string | number, mode: number): Subject<mwI.Adrs> {
    // console.log(this.formName,eda);
    const form = this.parent.form;
    let neweda: Subject<mwI.Adrs> = new Subject();
    let madr: MadrInput = {
      id: this.usrsrv.compid,
      mcode: mcode,
      eda: eda as number, // 新規登録のときは、通知の前に採番した数値へ置き換える
      zip: this.usrsrv.editFrmval(form.get(this.formName())!, 'zip'),
      region: this.usrsrv.editFrmval(form.get(this.formName())!, 'region'),
      local: this.usrsrv.editFrmval(form.get(this.formName())!, 'local'),
      street: this.usrsrv.editFrmval(form.get(this.formName())!, 'street'),
      extend: this.usrsrv.editFrmval(form.get(this.formName())!, 'extend'),
      tel: this.usrsrv.editFrmval(form.get(this.formName())!, 'tel'),
      fax: this.usrsrv.editFrmval(form.get(this.formName())!, 'fax'),
      tel2: this.usrsrv.editFrmval(form.get(this.formName())!, 'tel2'),
      tel3: this.usrsrv.editFrmval(form.get(this.formName())!, 'tel3'),
      extend2: this.usrsrv.editFrmval(form.get(this.formName())!, 'extend2'),
      adrname: this.usrsrv.editFrmval(form.get(this.formName())!, 'adrname'),
      nmemo: this.usrsrv.editFrmval(form.get(this.formName())!, 'nmemo'),
      smemo: this.usrsrv.editFrmval(form.get(this.formName())!, 'smemo'),
      omemo: this.usrsrv.editFrmval(form.get(this.formName())!, 'omemo'),
      del: this.usrsrv.editFrmval(form.get(this.formName())!, 'del'),
      ftel: this.usrsrv.editFtel(form.get(this.formName())!, 'tel', 'fax', 'tel2', 'tel3'),
      target: Boolean(form.get(this.formName())!.value.target),
      htitle: this.usrsrv.editFrmval(form.get(this.formName())!, 'htitle')
    }
    if (mode == 2) {
      this.apollo.mutate<UpdMadrResult>({
        mutation: Query.UpdateMast2,
        variables: {
          id: this.usrsrv.compid,
          mcd: mcode,
          eda: eda,
          "_set": madr
        },
      }).subscribe(({ data }) => {
        // console.log('update_msmadr', data);
        neweda.next(madr);
        // neweda.complete();
      }, (error) => {
        console.log('error update_msmember', error);
      });
    } else {
      let madrs: MadrInput[] = [];
      this.apollo.watchQuery<MaxEdaResult>({
        query: Query.GetMast6,
        variables: {
          id: this.usrsrv.compid,
          mcd: mcode
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data, data.msmadr_aggregate.aggregate.max.eda);
          let lceda = (data as MaxEdaResult).msmadr_aggregate.aggregate.max.eda + 1;
          if (lceda > 10) {
            madr.eda = lceda;
          } else {
            madr.eda = 10;
          }
          neweda.next(madr);
          // neweda.complete();
          // console.log(madr);
          madrs.push(madr);
          this.apollo.mutate<InsMadrResult>({
            mutation: Query.InsertMast2,
            variables: {
              "object": madrs
            },
          }).subscribe(({ data }) => {
            console.log('Insert_msmadr', data);
          }, (error) => {
            console.log('error Insert_msmadr ' + this.formName(), error);
          });
        }, (error) => {
          console.log('error query get_maxeda', error);
        });
    }
    return neweda;
  }

}