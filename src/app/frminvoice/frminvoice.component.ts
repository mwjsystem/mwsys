import { Component, OnInit, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { Invoice, InvoiceService, Shime, SSTATUS, SST } from './invoice.service';
import { JdentblComponent } from './jdentbl.component';
import { InvoicePdfService } from './invoice-pdf.service';
import { PdfService } from './../services/pdf.service';
import { MailerService } from './../services/mailer.service';
import { BeforeunloadBase } from '../beforeunload-base';
import { UserService } from './../services/user.service';
import { MembsService } from './../mstmember/membs.service';
import { StaffService } from './../services/staff.service';
import { SeikyuhelpComponent } from './../share/seikyuhelp/seikyuhelp.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow } from '@angular/material/table';
import { DecimalPipe, DatePipe } from '@angular/common';
import { JdatePipe } from '../core/pipes/jdate.pipe';
import { McdtxtPipe } from '../core/pipes/mcdtxt.pipe';

@Component({
    selector: 'app-frminvoice',
    templateUrl: './frminvoice.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '(window:beforeunload)': 'beforeUnload($event)'
    },
    imports: [MatToolbar, MatButton, MatIcon, MatTooltip, MatFormField, MatLabel, MatInput, FormsModule, ReactiveFormsModule, MatIconButton, MatSuffix, MatCard, MatCardHeader, MatCardTitle, MatCardContent, MatCheckbox, MatSelect, MatOption, MatDatepickerInput, MatDatepickerToggle, MatDatepicker, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow, JdentblComponent, DecimalPipe, DatePipe, JdatePipe, McdtxtPipe]
})
export class FrminvoiceComponent extends BeforeunloadBase implements OnInit, AfterViewInit {
    usrsrv = inject(UserService);
    memsrv = inject(MembsService);
    stfsrv = inject(StaffService);
    invsrv = inject(InvoiceService);
    private ipdfsrv = inject(InvoicePdfService);
    private pdfsrv = inject(PdfService);
    private mailsrv = inject(MailerService);
    private fb = inject(FormBuilder);
    private title = inject(Title);
    private route = inject(ActivatedRoute);
    private dialog = inject(MatDialog);
    private cdRef = inject(ChangeDetectorRef);

    form!: FormGroup;
    /** 照会中の請求伝票番号 */
    denno: number = 0;
    /** 照会中の請求伝票 */
    invoice?: Invoice;
    /** 締め処理の対象一覧 */
    rows: Shime[] = [];
    /** 未請求の掛伝票があるが締め日が未設定の請求先 */
    nosime: string[] = [];
    /** 抽出・作成・取消の処理中 */
    busy: boolean = false;
    /** 送付の進捗の値（テンプレートで使う） */
    readonly SST = SST;
    shimeColumns = ['chk', 'mcode', 'fday', 'zenkai', 'nmon', 'tmon', 'kurikosi', 'taxmon', 'tax', 'seikyu', 'dencnt'];

    constructor() {
        super();
        this.title.setTitle('請求伝票(MWSystem)');
    }

    ngOnInit(): void {
        this.form = this.fb.group({
            sday: new FormControl(this.invsrv.defaultSday()),
            // 顧客マスタの担当者（msmember.tcode）。初期値はログインユーザー、空欄は全担当者
            tcode: new FormControl(this.usrsrv.staff?.code ?? null)
        });
        if (this.stfsrv.tcds.length == 0) {
            // OnPush のため、一覧の読み込み後に再描画して担当者の選択肢を表示する
            this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
        }
        // 締め日・担当者を変えたら、抽出済みの一覧は無効
        this.form.valueChanges.subscribe(() => {
            this.rows = [];
            this.nosime = [];
            this.form.markAsPristine();
        });
    }
    ngAfterViewInit(): void {
        // 画面を直接開いたときは ngOnInit の時点でログインユーザーが未取得のことがある
        this.usrsrv.staffReady.then(staff => {
            if (!this.form.value.tcode && staff?.code && this.rows.length == 0) {
                this.form.patchValue({ tcode: staff.code }, { emitEvent: false });
                this.cdRef.detectChanges();
            }
        });
        this.memsrv.getMembers().then(() => {
            this.route.paramMap.subscribe((params: ParamMap) => {
                if (params.get('denno') !== null) {
                    this.denno = Number(params.get('denno'));
                    this.getInvoice(this.denno);
                }
            });
        });
    }

    onEnter() {
        this.denno = this.usrsrv.convNumber(this.denno);
        if (this.denno) {
            this.getInvoice(this.denno);
        } else {
            this.invoice = undefined;
            this.cdRef.detectChanges();
        }
    }

    async getInvoice(denno: number) {
        try {
            this.invoice = await this.invsrv.qryInvoice(denno);
            if (this.invoice == null) {
                this.usrsrv.toastInf('請求伝票番号' + denno + 'は登録されていません');
                history.replaceState('', '', './frminvoice');
            } else {
                history.replaceState('', '', './frminvoice/3/' + denno);
            }
        } catch (error) {
            this.usrsrv.toastErr('データベースエラー', '請求伝票' + denno + 'を読み込めませんでした');
            console.log('error query get_invoice', error);
        }
        this.cdRef.detectChanges();
        // 照会は締め処理の一覧の下に出るので、表示した照会までスクロールする
        if (this.invoice) {
            document.getElementById('invoice-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    dennoHelp() {
        let dialogConfig = new MatDialogConfig();
        dialogConfig.width = '100vw';
        dialogConfig.height = '98%';
        dialogConfig.panelClass = 'full-screen-modal';
        let dialogRef = this.dialog.open(SeikyuhelpComponent, dialogConfig);

        dialogRef.afterClosed().subscribe(
            data => {
                if (typeof data != 'undefined') {
                    this.denno = data.denno;
                    this.getInvoice(this.denno);
                }
            }
        );
    }

    /** 締め処理の対象を抽出する */
    async getShime() {
        const sday: Date | null = this.form.value.sday;
        if (sday == null) {
            this.usrsrv.toastWar('締め日を入力してください');
            return;
        }
        if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
            return;
        }
        this.busy = true;
        this.cdRef.detectChanges();
        try {
            const result = await this.invsrv.qryShime(sday, this.form.value.tcode || null);
            this.rows = result.rows;
            this.nosime = result.nosime;
            if (this.rows.length == 0) {
                this.usrsrv.toastInf('締め日' + this.usrsrv.formatDate(sday) + 'の請求対象はありません');
                this.form.markAsPristine();
            } else {
                this.form.markAsDirty();
            }
        } catch (error) {
            this.usrsrv.toastErr('データベースエラー', '請求対象を抽出できませんでした');
            console.log('error query get_shime', error);
        }
        this.busy = false;
        this.cdRef.detectChanges();
    }

    /** 請求伝票を作成できる行（請求済・後の締めありは除く） */
    private get openRows(): Shime[] {
        return this.rows.filter(e => !e.done && !e.later);
    }
    get chkRows(): Shime[] {
        return this.openRows.filter(e => e.chk);
    }
    get allChecked(): boolean {
        const open = this.openRows;
        return open.length > 0 && open.every(e => e.chk);
    }
    checkAll(flg: boolean) {
        this.openRows.forEach(e => e.chk = flg);
    }
    sumRows(fld: 'zenkai' | 'nmon' | 'tmon' | 'kurikosi' | 'taxmon' | 'tax' | 'seikyu' | 'dencnt'): number {
        return this.chkRows.reduce((sum, e) => sum + e.head[fld], 0);
    }

    /** 選択した請求先の請求伝票を作成する（請求先ごとに 1 トランザクション） */
    async create() {
        const targets = this.chkRows;
        if (targets.length == 0) {
            this.usrsrv.toastWar('請求伝票を作成する請求先を選択してください');
            return;
        }
        if (!confirm('締め日' + targets[0].head.sday + 'の請求伝票を' + targets.length + '件作成します。よろしいですか？')) {
            return;
        }
        this.busy = true;
        this.cdRef.detectChanges();
        // 件数分の番号をまとめて採番し、末尾から割り当てる
        const last = await this.usrsrv.getNumber('idenno', targets.length);
        if (!last) {
            this.busy = false;
            this.cdRef.detectChanges();
            return;
        }
        let cnt = 0;
        const ngs: string[] = [];
        for (let i = 0; i < targets.length; i++) {
            const row = targets[i];
            const denno = last - targets.length + 1 + i;
            try {
                const result = await this.invsrv.insSeikyu(row, denno);
                row.head.denno = denno;
                row.done = true;
                row.chk = false;
                cnt++;
                if (result.update_trjyuden.affected_rows != row.jyudens.length || result.update_trnyusub.affected_rows != row.nyusubs.length) {
                    ngs.push(row.head.mcode + '（請求伝票' + denno + '：抽出後に他で計上された伝票があります。内容を確認してください）');
                }
            } catch (error) {
                // 一意制約違反（同じ締め日の請求伝票が既にある）もここに来る
                ngs.push(row.head.mcode + '（作成できませんでした）');
                console.log('error insert_seikyu', row.head.mcode, error);
            }
        }
        this.busy = false;
        if (cnt > 0) {
            this.usrsrv.toastSuc('請求伝票を' + cnt + '件作成しました');
        }
        if (ngs.length > 0) {
            this.usrsrv.toastErr('請求伝票の作成で確認が必要な請求先があります', ngs.join('\n'));
        }
        if (this.chkRows.length == 0) {
            this.form.markAsPristine();
        }
        this.cdRef.detectChanges();
    }

    /** 一覧で請求済になっている請求伝票 */
    get doneRows(): Shime[] {
        return this.rows.filter(e => e.done && e.head.denno);
    }
    /** 一覧で請求済のうち、チェックした請求伝票 */
    get selRows(): Shime[] {
        return this.doneRows.filter(e => e.chk);
    }
    get allDoneChecked(): boolean {
        const done = this.doneRows;
        return done.length > 0 && done.every(e => e.chk);
    }
    checkAllDone(flg: boolean) {
        this.doneRows.forEach(e => e.chk = flg);
    }
    /** チェックした請求伝票のうち、進捗が sts のいずれかのもの */
    selIn(...sts: number[]): Shime[] {
        return this.selRows.filter(e => sts.includes(e.head.sstatus));
    }
    statusName(sts: number): string {
        return SSTATUS[sts] ?? '';
    }

    /** 照会中の請求伝票の操作ログ（登録・進捗・取消）を表示する */
    opelog() {
        if (this.invoice == null) {
            return;
        }
        const data: OpelogParam = { extype: '5', keycode: String(this.invoice.head.denno), title: '請求伝票 ' + this.invoice.head.denno };
        this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data: data });
    }

    /** 照会中の請求伝票の請求書を PDF で保存する */
    async pdfOne() {
        if (this.invoice == null) {
            return;
        }
        await this.makePdf([this.invoice.head.denno]);
    }

    /** 一覧でチェックした請求済の請求伝票の請求書を、まとめて ZIP で保存する */
    async pdfBatch() {
        const dennos = this.selRows.map(e => e.head.denno);
        if (dennos.length == 0) {
            return;
        }
        await this.makePdf(dennos, '請求書_締め日' + this.usrsrv.formatDate(this.form.value.sday) + '.zip');
    }

    /** 進捗の操作の対象（照会中の 1 件、または一覧でチェックした請求伝票のうち、進捗が sts のもの） */
    private targetsOf(all: boolean, ...sts: number[]): number[] {
        if (all) {
            return this.selIn(...sts).map(e => e.head.denno);
        }
        return this.invoice && !this.invoice.head.del && sts.includes(this.invoice.head.sstatus) ? [this.invoice.head.denno] : [];
    }

    /** 進捗を from から to に変え、一覧と照会の表示を合わせる */
    private async changeStatus(dennos: number[], from: number, to: number): Promise<number> {
        const cnt = await this.invsrv.setStatus(dennos, from, to);
        this.rows.filter(e => dennos.includes(e.head.denno) && e.head.sstatus == from).forEach(e => e.head.sstatus = to);
        if (this.invoice && dennos.includes(this.invoice.head.denno)) {
            await this.getInvoice(this.invoice.head.denno);
        }
        return cnt;
    }

    /** 経理確認済にする（未確認 → 経理確認済） */
    async keiri(all: boolean) {
        await this.stepStatus(all, SST.MIKAKUNIN, SST.KEIRI, '経理確認済にします');
    }
    /** 営業OK にする（営業確認依頼済 → 営業OK） */
    async eigyoOk(all: boolean) {
        await this.stepStatus(all, SST.IRAI, SST.EIGYO_OK, '営業OKにします');
    }
    /** 照会中の請求伝票の進捗を一つ戻す */
    async stepBack() {
        if (this.invoice == null || this.invoice.head.sstatus <= SST.MIKAKUNIN) {
            return;
        }
        const from = this.invoice.head.sstatus;
        if (!confirm('請求伝票' + this.invoice.head.denno + 'の進捗を「' + this.statusName(from) + '」から「' + this.statusName(from - 1) + '」に戻します。よろしいですか？')) {
            return;
        }
        await this.stepStatus(false, from, from - 1, '');
    }
    private async stepStatus(all: boolean, from: number, to: number, what: string) {
        const dennos = this.targetsOf(all, from);
        if (dennos.length == 0) {
            return;
        }
        if (all && !confirm('チェックした請求伝票のうち「' + this.statusName(from) + '」の' + dennos.length + '件を、' + what + '。よろしいですか？')) {
            return;
        }
        this.busy = true;
        this.cdRef.detectChanges();
        try {
            const cnt = await this.changeStatus(dennos, from, to);
            this.usrsrv.toastSuc(cnt + '件の進捗を「' + this.statusName(to) + '」にしました');
            if (cnt < dennos.length) {
                this.usrsrv.toastWar((dennos.length - cnt) + '件は、ほかの人が先に進捗を変えたため変更しませんでした（抽出し直してください）');
            }
        } catch (error) {
            this.usrsrv.toastErr('データベースエラー', '進捗を変更できませんでした');
            console.log('error update sstatus', error);
        }
        this.busy = false;
        this.cdRef.detectChanges();
    }

    /**
     * 請求書を添付したメールの作成画面（Thunderbird）を開く。照会中の 1 件、または一覧でチェックした請求伝票。
     * kind = 'sales'（営業担当へ確認依頼。経理確認済・営業確認依頼済［再送］が対象）
     *       / 'customer'（顧客へ送付。営業OK・顧客送付済［再送］が対象）。
     * 送信は作成画面で担当者が行う。作成画面を開いた時点で、進捗を営業確認依頼済／顧客送付済に進める。
     */
    async mail(kind: 'sales' | 'customer', all: boolean) {
        const [from, to] = kind == 'sales' ? [SST.KEIRI, SST.IRAI] : [SST.EIGYO_OK, SST.SOFU];
        const dennos = this.targetsOf(all, from, to);
        if (dennos.length == 0) {
            return;
        }
        const what = kind == 'sales' ? '営業担当への確認依頼' : '顧客への送付';
        if (all && !confirm('請求書' + dennos.length + '件の' + what + 'メールを作成します（Thunderbird の作成画面が' + dennos.length + '件開きます）。よろしいですか？')) {
            return;
        }
        this.busy = true;
        this.cdRef.detectChanges();
        try {
            const pdfs = await this.ipdfsrv.create(dennos);
            const items = pdfs.map(e => ({ pdf: e, mail: kind == 'sales' ? e.salesMail : e.customerMail }));
            const nomail = items.filter(e => !e.mail.to);
            const targets = items.filter(e => e.mail.to);
            if (targets.length > 0) {
                await this.mailsrv.compose(targets.map(e => ({
                    denno: e.pdf.denno, fileName: e.pdf.fileName, blob: e.pdf.blob, ...e.mail
                })));
                // 作成画面を開いた請求伝票の進捗を進める（再送のものは進捗が from ではないので変わらない）
                await this.changeStatus(targets.map(e => e.pdf.denno), from, to);
                this.usrsrv.toastSuc(what + 'メールを' + targets.length + '件作成します（Thunderbird の作成画面を確認して送信してください）');
            }
            if (nomail.length > 0) {
                const who = kind == 'sales' ? '営業担当（顧客マスタの営業担当・担当者マスタのメール）' : '顧客マスタのメール';
                this.usrsrv.toastWar(who + 'が無いため作成しませんでした：' + nomail.map(e => e.pdf.mcode + ' ' + e.pdf.name).join('、'));
            }
        } catch (error) {
            this.usrsrv.toastErr('メールの作成エラー', what + 'メールを作成できませんでした');
            console.log('error invoice mail', error);
        }
        this.busy = false;
        this.cdRef.detectChanges();
    }

    private async makePdf(dennos: number[], zipName?: string) {
        this.busy = true;
        this.cdRef.detectChanges();
        try {
            const pdfs = await this.ipdfsrv.create(dennos);
            if (zipName) {
                await this.pdfsrv.downloadZip(pdfs.map(e => ({ name: e.fileName, blob: e.blob })), zipName);
            } else {
                pdfs.forEach(e => this.pdfsrv.download(e.blob, e.fileName));
            }
            this.usrsrv.toastSuc('請求書を' + pdfs.length + '件作成しました');
        } catch (error) {
            this.usrsrv.toastErr('請求書の作成エラー', '請求書（PDF）を作成できませんでした');
            console.log('error invoice pdf', error);
        }
        this.busy = false;
        this.cdRef.detectChanges();
    }

    /** 照会中の請求伝票を取り消す */
    async cancelInvoice() {
        if (this.invoice == null || this.invoice.lock) {
            return;
        }
        const head = this.invoice.head;
        if (!confirm('請求伝票' + head.denno + '（' + head.mcode + '、締め日' + head.sday + '）を取り消します。\n計上した受注伝票・請求入金伝票は未請求に戻ります。取り消した請求伝票は取消済として残ります。よろしいですか？')) {
            return;
        }
        this.busy = true;
        this.cdRef.detectChanges();
        try {
            const result = await this.invsrv.delSeikyu(head.denno);
            if (result.update_trseikyu.affected_rows == 0) {
                this.usrsrv.toastWar('請求伝票' + head.denno + 'は既に取り消されています');
            } else {
                this.usrsrv.toastSuc('請求伝票' + head.denno + 'を取り消しました');
            }
            // 抽出済みの一覧は取消前の状態なので抽出し直してもらう
            this.rows = [];
            this.nosime = [];
            this.form.markAsPristine();
            this.busy = false;
            // 取消済の状態で表示し直す
            await this.getInvoice(head.denno);
            return;
        } catch (error) {
            this.usrsrv.toastErr('データベースエラー', '請求伝票' + head.denno + 'を取り消せませんでした');
            console.log('error delete_seikyu', error);
        }
        this.busy = false;
        this.cdRef.detectChanges();
    }
}
