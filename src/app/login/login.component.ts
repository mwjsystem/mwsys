import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LoginComponent implements OnInit {
  auth = inject(AuthService);


  ngOnInit(): void {
  }

  login(): void {
    // Call this to redirect the user to the login page
    this.auth.loginWithRedirect();
  }

}