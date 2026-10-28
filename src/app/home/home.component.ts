import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatCard, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatCard, MatCardTitle, MatCardContent, MatIcon]
})
export class HomeComponent implements OnInit {
  private title = inject(Title);

  // userInfo: {[key: string]: any} = {};
  constructor() {
    this.title.setTitle('ホーム(MWSystem)');
  }

  ngOnInit(): void {
  }

}
