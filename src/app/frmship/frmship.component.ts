import { Component, OnInit, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { ShipService, ShipRow, ShipResult } from './ship.service';
import { JDST, denForm } from './ship-forms';
import { PdfService } from './../services/pdf.service';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { OkuriService } from './../services/okuri.service';
import { StaffService } from './../services/staff.service';
import { NasService } from './../services/nas.service';
import { MembsService } from './../mstmember/membs.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { DecimalPipe, DatePipe } from '@angular/common';
import { McdtxtPipe } from '../core/pipes/mcdtxt.pipe';

/**
 * 受注一覧（出荷指示）。出荷予定日・担当者で受注伝票を抽出し、チェックした伝票の出荷指示フォルダ
 * （納品書・出荷指示書）を NAS にまとめて作る。作成後は受注ステータスが「出荷指示フォルダ作成済」になる。
 * 受注伝票の「出荷指示」ボタンからは /frmship/1/伝票番号 で開き、その伝票だけを表示する。
 */
@Component({
    selector: 'app-frmship',
    templateUrl: './frmship.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatToolbar, MatButton, MatIcon, MatTooltip, MatFormField, MatLabel, MatInput, MatSuffix, FormsModule, ReactiveFormsModule, MatCard, MatCardContent, MatCheckbox, MatSelect, MatOption, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, DecimalPipe, DatePipe, McdtxtPipe]
})
export class FrmshipComponent implements OnInit, AfterViewInit {
    usrsrv = inject(UserService);
    stfsrv = inject(StaffService);
    bunsrv = inject(BunruiService);
    okrsrv = inject(OkuriService);
    nassrv = inject(NasService);
    private memsrv = inject(MembsService);
    private shipsrv = inject(ShipService);
    private pdfsrv = inject(PdfService);
    private fb = inject(FormBuilder);
    private title = inject(Title);
    private route = inject(ActivatedRoute);
    private cdRef = inject(ChangeDetectorRef);

    form!: FormGroup;
    rows: ShipRow[] = [];
    /** 直前の保存結果 */
    results: ShipResult[] = [];
    busy = false;
    /** 処理中の進み具合 */
    progress = '';
    /** 伝票番号を指定して開いたときの伝票番号 */
    denno = 0;
    readonly JDST = JDST;
    columns = ['chk', 'denno', 'jdstatus', 'sday', 'mcode', 'ncode', 'hcode', 'okurisuu', 'buntype', 'total', 'okurino', 'shipdir'];

    constructor() {
        this.title.setTitle('受注一覧・出荷指示(MWSystem)');
    }

    ngOnInit(): void {
        const today = new Date();
        this.form = this.fb.group({
            from: new FormControl(today),
            to: new FormControl(this.usrsrv.getNextday(today)),
            tcode: new FormControl(this.usrsrv.staff?.code ?? null),
            // 'todo' = 出荷指示フォルダ未作成（受注登録）だけ、'' = すべて
            status: new FormControl('todo')
        });
        if (this.stfsrv.tcds.length == 0) {
            this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
        }
        if (this.okrsrv.hokuri.length == 0) {
            this.okrsrv.getHokuri();
            this.okrsrv.getHaisou();
        }
        this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges());
    }

    ngAfterViewInit(): void {
        this.usrsrv.staffReady.then(staff => {
            if (!this.form.value.tcode && staff?.code && !this.denno) {
                this.form.patchValue({ tcode: staff.code });
                this.cdRef.detectChanges();
            }
        });
        this.memsrv.getMembers().then(() => {
            this.route.paramMap.subscribe((params: ParamMap) => {
                if (params.get('denno') !== null) {
                    this.denno = Number(params.get('denno'));
                    this.search();
                } else {
                    this.cdRef.detectChanges();
                }
            });
        });
    }

    /** 抽出（伝票番号を指定して開いたときは、その伝票だけ） */
    async search() {
        this.busy = true;
        this.results = [];
        this.cdRef.detectChanges();
        try {
            if (this.denno) {
                this.rows = await this.shipsrv.list({ from: '', to: '', tcode: null, jdstatus: [], denno: this.denno });
            } else {
                const v = this.form.value;
                this.rows = await this.shipsrv.list({
                    from: this.usrsrv.formatDate(v.from), to: this.usrsrv.formatDate(v.to ?? v.from),
                    tcode: v.tcode || null,
                    jdstatus: v.status == 'todo' ? [JDST.TOROKU] : []
                });
            }
            // 出荷指示フォルダが未作成（受注登録）の伝票を初めからチェックする
            this.rows.forEach(e => e.chk = e.jdstatus == JDST.TOROKU || !!this.denno);
            if (this.rows.length == 0) {
                this.usrsrv.toastWar('条件に合う受注伝票がありません');
            }
        } catch (e) {
            this.usrsrv.toastErr('データベースエラー', '受注伝票を抽出できませんでした');
            console.log('error search frmship', e);
        }
        this.busy = false;
        this.cdRef.detectChanges();
    }

    /** 全件表示に戻す（伝票番号を指定して開いたとき） */
    clearDenno() {
        this.denno = 0;
        history.replaceState('', '', './frmship');
        this.rows = [];
        this.results = [];
        this.cdRef.detectChanges();
    }

    get selRows(): ShipRow[] {
        return this.rows.filter(e => e.chk);
    }

    get allChecked(): boolean {
        return this.rows.length > 0 && this.rows.every(e => e.chk);
    }

    checkAll(chk: boolean) {
        this.rows.forEach(e => e.chk = chk);
    }

    /** NAS に出荷指示フォルダを作る */
    async saveNas() {
        const sel = this.selRows;
        if (sel.length == 0) {
            return;
        }
        const again = sel.filter(e => e.jdstatus == JDST.FOLDER || e.jdstatus == JDST.PRINTED || e.jdstatus == JDST.PICKED);
        if (again.length > 0 && !confirm('出荷指示フォルダを作成済の伝票が ' + again.length + ' 件あります（' + again.map(e => e.denno).join(', ') +
            '）。\nもう一度作成しますか？（倉庫で出力済のときは「差替分」のフォルダになります）')) {
            return;
        }
        this.busy = true;
        this.progress = 'NAS に保存しています…';
        this.cdRef.detectChanges();
        try {
            this.results = await this.shipsrv.saveToNas(sel.map(e => e.denno), (done, all) => {
                this.progress = 'NAS に保存しています…（' + done + ' / ' + all + '）';
                this.cdRef.detectChanges();
            });
            const ng = this.results.filter(e => e.error);
            if (ng.length == 0) {
                this.usrsrv.toastSuc(this.results.length + ' 件の出荷指示フォルダを作成しました');
            } else {
                this.usrsrv.toastErr('一部作成できませんでした', ng.length + ' 件（下の結果を確認してください）');
            }
        } catch (e) {
            this.usrsrv.toastErr('NAS に保存できませんでした', (e as Error).message);
            console.log('error saveNas', e);
        }
        this.progress = '';
        this.busy = false;
        // 状態の表示を更新する（結果の表示は残す）
        const results = this.results;
        await this.search();
        this.results = results;
        this.cdRef.detectChanges();
    }

    /** 納品書・出荷指示書の PDF を確認用にダウンロードする（NAS には保存しない・状態も変えない） */
    async downloadPdf() {
        const sel = this.selRows;
        if (sel.length == 0) {
            return;
        }
        this.busy = true;
        this.progress = 'PDF を作成しています…';
        this.cdRef.detectChanges();
        try {
            const files = await this.shipsrv.pdfs(sel.map(e => e.denno));
            if (files.length == 1) {
                this.pdfsrv.download(files[0].blob, files[0].name);
            } else {
                await this.pdfsrv.downloadZip(files, '出荷指示_' + this.usrsrv.formatDate(new Date()).replace(/-/g, '') + '.zip');
            }
        } catch (e) {
            this.usrsrv.toastErr('PDF を作成できませんでした', (e as Error).message);
            console.log('error downloadPdf', e);
        }
        this.progress = '';
        this.busy = false;
        this.cdRef.detectChanges();
    }

    statusName(value: string | null): string {
        return this.bunsrv.kbn['jdstatus']?.find(e => e.value == value)?.viewval ?? value ?? '';
    }

    statusColor(value: string | null): string {
        return value == JDST.PICKED || value == JDST.PRINTED ? '#2e7d32' : value == JDST.FOLDER ? '#1565c0' : value == JDST.TOROKU ? '#e65100' : '#666666';
    }

    formName(buntype: string | null): string {
        return denForm(buntype)?.name ?? (buntype ? buntype + '（未登録）' : '未設定');
    }

    hokuriName(hcode: string | null): string {
        return this.okrsrv.hokuri.find(e => e.code == hcode)?.name ?? hcode ?? '';
    }

    openSales(denno: number) {
        this.usrsrv.openMst('frmsales', String(denno));
    }

    get total(): number {
        return this.selRows.reduce((s, e) => s + Number(e.total ?? 0), 0);
    }
}
