import { Component, OnInit, Input } from '@angular/core';
import { FormGroupDirective, FormGroup, FormControl, Validators, ControlContainer, FormArray, FormBuilder } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { BunruiService } from './../../services/bunrui.service';
// import { TabService } from './../tabidx/tab.service';
import { Observable, Subject } from 'rxjs';

@Component({
  selector: 'app-address',
  templateUrl: './address.component.html',
  // providers: [TabService],
  styleUrls: ['./address.component.scss'],
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ]
})
export class AddressComponent implements OnInit {
  @Input() formName: string;
  constructor(private parent: FormGroupDirective,
    private usrsrv: UserService,
    public bunsrv: BunruiService,
    private apollo: Apollo) { }

  ngOnInit(): void {
    const form = this.parent.form;
    // if (this.formName=='addr1') {
    form.addControl(this.formName, new FormGroup({
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
      nbikou: new FormControl(''),
      sbikou: new FormControl(''),
      obikou: new FormControl(''),
      del: new FormControl(''),
      target: new FormControl(''),
      htitle: new FormControl('')
    }));
    // } else {
    //   form.addControl(this.formName, new FormGroup({
    //     zip: new FormControl('', Validators.required),
    //     region: new FormControl('', Validators.required),
    //     local: new FormControl('', Validators.required),
    //     street: new FormControl(''),
    //     extend: new FormControl(''),
    //     extend2: new FormControl(''),
    //     adrname: new FormControl('', Validators.required),
    //     tel: new FormControl('', Validators.required),
    //     fax: new FormControl(''),
    //     tel2: new FormControl(''),
    //     tel3: new FormControl(''),
    //     adrbikou: new FormControl(''),
    //     adrinbikou: new FormControl(''),
    //     adrokrbko: new FormControl(''),
    //     del: new FormControl(''),
    //     target: new FormControl('')
    //   }));     
    // }   
  }
  updTel(fldnm: string, value: string) {
    let val: string = this.usrsrv.convTel(value);
    // console.log(value,val);
    this.parent.form.get(this.formName).get(fldnm).setValue(val);
  }

  saveMadr(mcode: string, eda: string | number, mode: number): Subject<any> {
    // console.log(this.formName,eda);
    const form = this.parent.form;
    let neweda: Subject<any> = new Subject();
    let madr: any = {
      id: this.usrsrv.compid,
      mcode: mcode,
      eda: eda,
      zip: this.usrsrv.editFrmval(form.get(this.formName), 'zip'),
      region: this.usrsrv.editFrmval(form.get(this.formName), 'region'),
      local: this.usrsrv.editFrmval(form.get(this.formName), 'local'),
      street: this.usrsrv.editFrmval(form.get(this.formName), 'street'),
      extend: this.usrsrv.editFrmval(form.get(this.formName), 'extend'),
      tel: this.usrsrv.editFrmval(form.get(this.formName), 'tel'),
      fax: this.usrsrv.editFrmval(form.get(this.formName), 'fax'),
      tel2: this.usrsrv.editFrmval(form.get(this.formName), 'tel2'),
      tel3: this.usrsrv.editFrmval(form.get(this.formName), 'tel3'),
      extend2: this.usrsrv.editFrmval(form.get(this.formName), 'extend2'),
      adrname: this.usrsrv.editFrmval(form.get(this.formName), 'adrname'),
      nbikou: this.usrsrv.editFrmval(form.get(this.formName), 'nbikou'),
      sbikou: this.usrsrv.editFrmval(form.get(this.formName), 'sbikou'),
      obikou: this.usrsrv.editFrmval(form.get(this.formName), 'obikou'),
      del: this.usrsrv.editFrmval(form.get(this.formName), 'del'),
      ftel: this.usrsrv.editFtel(form.get(this.formName), 'tel', 'fax', 'tel2', 'tel3'),
      target: Boolean(form.get(this.formName).value.target),
      htitle: this.usrsrv.editFrmval(form.get(this.formName), 'htitle')
    }
    if (mode == 2) {
      this.apollo.mutate<any>({
        mutation: Query.UpdateMast2,
        variables: {
          id: this.usrsrv.compid,
          mcode: mcode,
          eda: eda,
          "_set": madr
        },
      }).subscribe(({ data }) => {
        // console.log('update_msmadr', data);
        neweda.next(madr);
        neweda.complete();
      }, (error) => {
        console.log('error update_msmember', error);
      });
    } else {
      let madrs: any[] = [];
      this.apollo.watchQuery<any>({
        query: Query.GetMast6,
        variables: {
          id: this.usrsrv.compid,
          mcode: mcode
        },
      })
        .valueChanges
        .subscribe(({ data }) => {
          // console.log(data, data.msmadr_aggregate.aggregate.max.eda);
          let lceda = data.msmadr_aggregate.aggregate.max.eda + 1;
          if (lceda > 10) {
            madr.eda = lceda;
          } else {
            madr.eda = 10;
          }
          neweda.next(madr);
          neweda.complete();
          // console.log(madr);
          madrs.push(madr);
          this.apollo.mutate<any>({
            mutation: Query.InsertMast2,
            variables: {
              "object": madrs
            },
          }).subscribe(({ data }) => {
            console.log('Insert_msmadr', data);
          }, (error) => {
            console.log('error Insert_msmadr ' + this.formName, error);
          });
        }, (error) => {
          console.log('error query get_maxeda', error);
        });
    }
    return neweda;
  }
}
