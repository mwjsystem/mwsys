import { BrowserModule } from '@angular/platform-browser';
import { NgModule, LOCALE_ID } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { CommonModule, registerLocaleData } from '@angular/common';
import localeJa from '@angular/common/locales/ja';
// import { FormsModule, ReactiveFormsModule } from '@angular/forms';
// import { FlexLayoutModule } from '@angular/flex-layout';
import { MaterialModule } from './material.module';
import { AuthModule } from '@auth0/auth0-angular';
import { HttpClientModule } from '@angular/common/http';
import { environment } from './../environments/environment';
import { BeforeunloadGuard } from './beforeunload.guard';
import { GraphQLModule } from './graphql.module';
import { ToastrModule } from 'ngx-toastr'; 
import { NgxYubinBangoModule } from 'ngx-yubinbango';
import { CoreModule } from './core/core.module';

import { LoginComponent } from './login/login.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    AuthModule.forRoot({
      domain: environment.AUTH0_DOMAIN,
      clientId: environment.AUTH0_CLIENT_ID,
      redirectUri: `${window.location.origin}`
    }),
    BrowserAnimationsModule,
    // FormsModule,
    // FlexLayoutModule,
    // ReactiveFormsModule,
    GraphQLModule,
    ToastrModule.forRoot(),
    MaterialModule,
    HttpClientModule,
    NgxYubinBangoModule,
    CoreModule
  ],
  providers: [BeforeunloadGuard ,{ provide: LOCALE_ID, useValue: 'ja-JP' }],
  bootstrap: [AppComponent]
})
export class AppModule { }
