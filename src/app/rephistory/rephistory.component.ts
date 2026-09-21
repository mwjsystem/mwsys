import { Component, OnInit, ElementRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormGroup, FormBuilder, FormControl } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { MatDialog, MatDialogConfig } from "@angular/material/dialog";
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { UserService } from './../services/user.service';
import { DownloadService } from './../services/download.service';

@Component({
    selector: 'app-rephistory',
    templateUrl: './rephistory.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RephistoryComponent {
  usrsrv = inject(UserService);
  private fb = inject(FormBuilder);
  private title = inject(Title);
  private elementRef = inject(ElementRef);
  private dwlsrv = inject(DownloadService);
  private dialog = inject(MatDialog);

  form!: FormGroup;
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
          this.form.get('mcode')!.setValue(data.mcode);
        }
      }
    );
  }

}
 