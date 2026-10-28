import { Component, OnInit, ElementRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl, AbstractControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { UserService } from './../services/user.service';
import { DownloadService } from './../services/download.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { McdtxtPipe } from '../core/pipes/mcdtxt.pipe';

/** 受注履歴フォーム の項目名（明細の mtbl は除く） */
type HistoryField = 'mcode';

@Component({
    selector: 'app-rephistory',
    templateUrl: './rephistory.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatToolbar, MatIcon, FormsModule, ReactiveFormsModule, MatFormField, MatLabel, MatInput, McdtxtPipe]
})
export class RephistoryComponent {
  usrsrv = inject(UserService);
  private fb = inject(FormBuilder);
  private title = inject(Title);
  private elementRef = inject(ElementRef);
  private dwlsrv = inject(DownloadService);
  private dialog = inject(MatDialog);

  form!: FormGroup;
  /** フォームの項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
  private get ctl(): Record<HistoryField, AbstractControl> {
    return this.form.controls as Record<HistoryField, AbstractControl>;
  }
  constructor() {
    const title = this.title;

    title.setTitle('受注履歴(MWSystem)');
  }

  ngOnInit(): void {
   　this.form = this.fb.group({mcode: new FormControl('')});
  }
  makeLstHist() {
    this.dwlsrv.dlKick(this.usrsrv.system.urischema + 'LST-HIST_' + this.usrsrv.compid + "-" + this.form.value.mcode, this.elementRef);
  }
  mcdHelp(): void {
    let dialogConfig = new MatDialogConfig();
    dialogConfig.width = '100vw';
    dialogConfig.height = '98%';
    dialogConfig.panelClass = 'full-screen-modal';
    let dialogRef = this.dialog.open(McdhelpComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(
      data => {
        if (typeof data != 'undefined') {
          this.ctl.mcode.setValue(data.mcode);
        }
      }
    );
  }

}
 