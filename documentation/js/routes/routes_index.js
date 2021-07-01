var ROUTES_INDEX = {"name":"<root>","kind":"module","className":"AppModule","children":[{"name":"routes","filename":"src/app/app-routing.module.ts","module":"AppRoutingModule","children":[{"path":"","loadChildren":"./home/home.module#HomeModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/home/home-routing.module.ts","module":"HomeRoutingModule","children":[{"path":"home","component":"HomeComponent"},{"path":"","redirectTo":"home","pathMatch":"full"}],"kind":"module"}],"module":"HomeModule"}]},{"path":"login","component":"LoginComponent"},{"path":"mstmember","loadChildren":"./mstmember/mstmember.module#MstmemberModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/mstmember/mstmember-routing.module.ts","module":"MstmemberRoutingModule","children":[{"path":"","component":"MstmemberComponent"},{"path":":mode/:mcd","component":"MstmemberComponent","canDeactivate":["BeforeunloadGuard"]}],"kind":"module"}],"module":"MstmemberModule"}]},{"path":"frmsales","loadChildren":"./frmsales/frmsales.module#FrmsalesModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/frmsales/frmsales-routing.module.ts","module":"FrmsalesRoutingModule","children":[{"path":"","component":"FrmsalesComponent"},{"path":":mode/:denno","component":"FrmsalesComponent","canDeactivate":["BeforeunloadGuard"]}],"kind":"module"}],"module":"FrmsalesModule"}]},{"path":"frmsupply","loadChildren":"./frmsupply/frmsupply.module#FrmsupplyModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/frmsupply/frmsupply-routing.module.ts","module":"FrmsupplyRoutingModule","children":[{"path":"","component":"FrmsupplyComponent"},{"path":":mode/:denno","component":"FrmsupplyComponent","canDeactivate":["BeforeunloadGuard"]}],"kind":"module"}],"module":"FrmsupplyModule"}]},{"path":"mstgoods","loadChildren":"./mstgoods/mstgoods.module#MstgoodsModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/mstgoods/mstgoods-routing.module.ts","module":"MstgoodsRoutingModule","children":[{"path":"","component":"MstgoodsComponent"},{"path":":mode/:grpcd","component":"MstgoodsComponent","canDeactivate":["BeforeunloadGuard"]}],"kind":"module"}],"module":"MstgoodsModule"}]},{"path":"frmkeep","loadChildren":"./frmkeep/frmkeep.module#FrmkeepModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/frmkeep/frmkeep-routing.module.ts","module":"FrmkeepRoutingModule","children":[{"path":"","component":"FrmkeepComponent"},{"path":":denno","component":"FrmkeepComponent"}],"kind":"module"}],"module":"FrmkeepModule"}]},{"path":"frmtreat","loadChildren":"./frmtreat/frmtreat.module#FrmtreatModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/frmtreat/frmtreat-routing.module.ts","module":"FrmtreatRoutingModule","children":[{"path":"","component":"FrmtreatComponent"}],"kind":"module"}],"module":"FrmtreatModule"}]},{"path":"repstock","loadChildren":"./repstock/repstock.module#RepstockModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/repstock/repstock-routing.module.ts","module":"RepstockRoutingModule","children":[{"path":"","component":"RepstockComponent"}],"kind":"module"}],"module":"RepstockModule"}]},{"path":"mstvendor","loadChildren":"./mstvendor/mstvendor.module#MstvendorModule","canActivate":["AuthGuard"],"children":[{"kind":"module","children":[{"name":"routes","filename":"src/app/mstvendor/mstvendor-routing.module.ts","module":"MstvendorRoutingModule","children":[{"path":"","component":"MstvendorComponent"},{"path":":mode/:vcd","component":"MstvendorComponent","canDeactivate":["BeforeunloadGuard"]}],"kind":"module"}],"module":"MstvendorModule"}]}],"kind":"module"}]}
