import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { CommonModule } from "@angular/common";
import { AuthModule } from "@auth0/auth0-angular";
import { Apollo } from "apollo-angular";
import { HttpClientModule } from "@angular/common/http";
import { environment } from "./../environments/environment";
import { BeforeunloadGuard } from "./beforeunload.guard";
import { GraphQLModule } from "./graphql.module";
import { ToastrModule } from "ngx-toastr";
import { CoreModule } from "./core/core.module";

import { UserService } from "./services/user.service";
import { LoginComponent } from "./login/login.component";
import { NavbarComponent } from "./navbar/navbar.component";

import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatNativeDateModule, MAT_DATE_LOCALE } from "@angular/material/core";
import { MatToolbarModule } from "@angular/material/toolbar";

@NgModule({
  declarations: [AppComponent, LoginComponent, NavbarComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    AuthModule.forRoot({
      domain: environment.AUTH0_DOMAIN,
      clientId: environment.AUTH0_CLIENT_ID,
      authorizationParams: {
        redirect_uri: window.location.origin,
      },
    }),
    BrowserAnimationsModule,
    GraphQLModule,
    ToastrModule.forRoot(),
    HttpClientModule,

    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatNativeDateModule,
    MatToolbarModule,
  ],
  providers: [
    Apollo,
    UserService,
    BeforeunloadGuard,
    { provide: MAT_DATE_LOCALE, useValue: "ja-JP" },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
