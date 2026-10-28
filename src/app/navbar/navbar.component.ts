import { Component, OnInit, ElementRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { UserService } from './../services/user.service';
import { NavmenuService } from './../services/navmenu.service';
import { DownloadService } from './../services/download.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatIconButton, MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { NasfolderComponent } from './../share/nasfolder/nasfolder.component';

@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatToolbar, MatIconButton, RouterLink, MatIcon, MatButton, MatMenuTrigger, MatMenu, MatMenuItem]
})
export class NavbarComponent implements OnInit {
  usrsrv = inject(UserService);
  navsrv = inject(NavmenuService);
  dwlsrv = inject(DownloadService);
  elementRef = inject(ElementRef);
  private dialog = inject(MatDialog);

  public db!: string;

  ngOnInit(): void {
    if (localStorage.getItem('MWSYS_DB') == null) {
      this.db = '本番環境';
    } else {
      this.db = 'テスト環境';
    }
	this.navsrv.getNavmenu();
	console.log('navmenu afterGet',this.navsrv.menu);
    // const color: string = localStorage.getItem(this.usrsrv.userInfo['nickname'] + 'MWSYS_COLOR');
    // console.log(color)
    // if (color !== null) { this.setColor(color); }
  }
  // setColor(colorname: string): void {
  //   var links = document.getElementsByTagName("link");
  //   for (var i = 0; i < links.length; i++) {
  //     var link = links[i];
  //     if (link.id == 'themeAsset') {
  //       link.href = 'https://unpkg.com/@angular/material/prebuilt-themes/' + colorname + '.css';
  //     }
  //   }
  //   localStorage.setItem(this.usrsrv.userInfo['nickname'] + 'MWSYS_COLOR', colorname);
  // }
  /** 出荷フォルダ（NAS）の設定（各 PC で保存先のフォルダを選ぶ） */
  openNasfolder() {
    this.dialog.open(NasfolderComponent, { width: '640px', maxWidth: '95vw' });
  }

  setDB(flg: boolean) {
    if (flg) {
      localStorage.setItem('MWSYS_DB', 'test');
      window.location.reload();
    } else {
      localStorage.removeItem('MWSYS_DB');
      window.location.reload();
    }
  }
  dlKick(form: string) {
    // console.log(this.elementRef.nativeElement); 
    this.dwlsrv.dlKick(this.usrsrv.system.urischema + form + this.usrsrv.compid, this.elementRef);
  }
}


