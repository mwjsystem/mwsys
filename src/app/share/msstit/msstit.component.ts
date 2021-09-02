import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';

@Component({
  selector: 'app-msstit',
  templateUrl: './msstit.component.html',
  styleUrls: ['./msstit.component.scss']
})
export class MsstitComponent implements OnInit {
  mcode: number;
  mode:number=3;
  form: FormGroup;
  constructor(private fb: FormBuilder,
              @Inject(MAT_DIALOG_DATA) data,
              private dialogRef: MatDialogRef<MsstitComponent>) { 
                this.mcode = data.mcode;
              }

  ngOnInit(): void {
    this.form = this.fb.group({});
  }
  modeToCre():void {
    this.mode=1;
    this.form.reset();
    this.form.enable();
    // this.edaOld=+this.eda;
    // this.eda="新規登録";
    // const bikou={nbikou:this.edasrv.adrs[0].nbikou,
    //              sbikou:this.edasrv.adrs[0].sbikou,
    //              obikou:this.edasrv.adrs[0].obikou};
    // this.form.get('addr').patchValue(bikou);
  }
  modeToUpd():void {
    this.mode=2;
    this.form.enable();
  }
  cancel():void {
    this.mode=3;
    this.form.disable();
  }
  save():void {
    this.mode=3;
    this.form.disable();
    this.form.markAsPristine();
  }
  close() {
    this.dialogRef.close();
  }

}
