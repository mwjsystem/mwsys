import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormArray, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
// import { DepttblComponent } from './depttbl.component';
import { InvoiceService } from './invoice.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { StaffService } from './../services/staff.service';

@Component({
    selector: 'app-frminvoice',
    templateUrl: './frminvoice.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    }
})
export class FrminvoiceComponent implements OnInit, AfterViewInit {
    usrsrv = inject(UserService);
    bunsrv = inject(BunruiService);
    stfsrv = inject(StaffService);
    invsrv = inject(InvoiceService);
    private fb = inject(FormBuilder);
    private title = inject(Title);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private elementRef = inject(ElementRef);
    private dialog = inject(MatDialog);
    private cdRef = inject(ChangeDetectorRef);

    // @ViewChild(DepttblComponent) depttbl: DepttblComponent;
    form!: FormGroup;
    denno: number = 0;
	rows: FormArray = this.fb.array([]);
    constructor() {
        const title = this.title;

        title.setTitle('請求伝票(MWSystem)');
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
	}
    ngAfterViewInit(): void { //子コンポーネント読み込み後に走る
    }
    onEnter() {
        this.denno = this.usrsrv.convNumber(this.denno);
        // this.get_nyuden(this.denno);
    }

    refresh(): void {
        if (this.invsrv.mode == 3) {
            this.form.disable();
        } else {
            this.form.enable();
        }
        this.cdRef.detectChanges();
    }
    dennoHelp() {

    }
    modeToCre(): void {
        this.invsrv.mode = 1;
        this.form.reset();
        this.denno = 0;

        // this.hmeitbl.frmArr.clear();
        // this.hmeitbl.add_rows(1);
        this.refresh();
    }
    modeToUpd(): void {
        this.invsrv.mode = 2;
        this.refresh();
        history.replaceState('', '', './frminvoice/' + this.invsrv.mode + '/' + this.denno);
    }
    cancel(): void {
        if (this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
            this.invsrv.mode = 3;
            // this.get_hatden(this.denno);
            this.refresh();
            this.form.markAsPristine();
            history.replaceState('', '', './frminvoice/' + this.invsrv.mode + '/' + this.denno);
        }
    }
	test(){
	}
    async save() {

    }
    getInvalid(): string {
        let tooltip: string = "";
        const ctrls0 = this.form.controls;
        for (const name in ctrls0) {
            if (ctrls0[name].invalid) {
                tooltip += this.usrsrv.getColtxt('trseikyu', name) + '⇒' + this.usrsrv.getValiderr(ctrls0[name].errors) + '\n';
            }
        }
        return tooltip;
    }

    shouldConfirmOnBeforeunload(): boolean {
        return this.form.dirty;
    }

    beforeUnload(e: Event) {
        if (this.shouldConfirmOnBeforeunload()) {
            e.returnValue = true;
        }
    }
}