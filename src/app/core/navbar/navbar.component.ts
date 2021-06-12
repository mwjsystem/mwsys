import { Component, OnInit } from '@angular/core';
import { UserService } from './../../services/user.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  public db:string;  
  constructor(public usrsrv:UserService) { }

  ngOnInit():void {
    this.db=localStorage.getItem('MWSYS_DB');
    if(this.db==null){
      this.db='本番環境';
    } else {  
      this.db='テスト環境';
    }
    const color:string = localStorage.getItem(this.usrsrv.userInfo.nickname + 'MWSYS_COLOR');
    if ( color !== null ){this.setColor(color);}
  }
  setColor(colorname:string):void {
    var links = document.getElementsByTagName("link"); 
    for(var i=0; i < links.length; i++) {
        var link = links[i];
        if (link.id=='themeAsset') {
          link.href = 'https://unpkg.com/@angular/material/prebuilt-themes/' + colorname + '.css';
        }
      }
    localStorage.setItem(this.usrsrv.userInfo.nickname + 'MWSYS_COLOR', colorname);
  }
  setDB(flg:boolean){
    if(flg){
      localStorage.setItem('MWSYS_DB','mwsystbl');
      window.location.reload();
    } else {
      localStorage.removeItem('MWSYS_DB');
      window.location.reload();
    }
  }
}

