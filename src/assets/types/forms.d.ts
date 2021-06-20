declare namespace mwI {
  interface Jyuden {
    id:number;
    denno:number;
    day:Date;
    yday:Date;
    sday:Date;
    uday:Date;
    nday:Date;
    hday:Date;
    htime:number;
    hcode:string;
    ncode:number;
    nadr:number;
    souko:string;
    tcode:number;
    bunsho:number;
    dbikou:string;
    nbikou:string;
    obikou:string;
    keep:string;
    okurisuu:number;
    okurino:string;
    cusden:string;
    inbikou:string;
    daibiki:number;
    gtotal:number;
    souryou:number;
    tesuu:number;
    nebiki:number;
    ttotal:number;
    tax:number;
    syoukei:number;
    total:number;
    okurinusi:string;
    skbn:string;
    uttotal:number;
    utax:number;
    httotal:number;
    gtotalzn:number;
    souryouzn:number;
    tesuuzn:number;
    nebikizn:number;
    taxtotal:number;
    total8:number;
    total10:number;
    genka:number;
    hgenka:number;
    egenka:number;
    torikbn:boolean;
    mcode:string;
    scode:string;
    jcode:string;
    pcode:string;
    daibunrui:string;
    chubunrui:string;
    shobunrui:string;
    tcode1 :string;
    del:boolean;
    created_at:Date;
    created_by:string;
    updated_at:Date;
    updated_by:string;
  }
  interface Jyumei {
    line:number;
    day:Date;
    sday:Date;
    souko:string;
    gcode:string;
    gtext:string;
    suu:number;
    iriunit:string;
    teika:number;
    tanka:number;
    money:number;
    mtax:number;
    mbikou:string;
    genka:number;
    spec:string;
    zaiko:number;
    jyuzan:number;
    tintanka:number;
    touttanka:number;
    taxtanka:number;
    tinmoney:number;
    toutmoney:number;
    taxmoney:number;
    taxrate:number;
    currency:string;
    code:string;
    gkbn:string;
    vcode:string;
  }
  // interface SalGds {
  //   gcode:string;
  //   gkbn:number;
  //   vcode:string;
  //   gtext:string;
  //   irisu:number;
  //   iriunit:string;
  //   max:number;
  //   send:string;
  //   order:boolean;
  //   koguchi:number;
  //   skbn:number;
  //   zkbn:number;
  //   day:Date;
  // }  
  interface Trjyuden extends Jyuden{
    trjyumeis:Jyumei[];
  }

  interface Tropelog {
    sequ:number;
    keycode:string;
    extype:string;
    memo:string;
    created_by:string;
    created_at:Date;
    status:number;
    updated_by:string;
    updated_at:Date;
  }

  interface Trtreat {id:number;
    seq:number;
    created_at:Date;
    created_by:number;
    genre:string;
    mcode:number;
    grpcode:string;
    gcode:string;
    tel:string;
    email:string;
    question:string;
    answer:string;
    kaizen:string;
    result:string;
    trttype:string;
  }
  interface Hatden {
    id:number;
    denno:number;
    vcode:number;
    day:Date;
    soko:string;
    tcode:string;
    dbiko:string;
    inbiko:string;
    gtotal:number;
    ttotal:number;
    tax:number;
    total:number;
    created_at:string;
    created_by:Date;
    updated_at:string;
    updated_by:Date;
    jdenno:number;
  }

  interface Hatmei {
    line:number;
    day:Date;
    inday:Date;
    // soko:string;
    gcode:string;
    gtext:string;
    suu:number;
    genka:number;
    money:number;
    taxrate:string;
    iriunit:string;
    mbiko:string;
    spec:string;
    jdenno:number;
    jline:number;
    yday:Date;
    ydaykbn:string;
    mtax:string;
  }

  interface Trhatden extends Hatden{
    trhatmeis:Hatmei[];
  }
}