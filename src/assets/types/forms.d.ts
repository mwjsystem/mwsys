declare namespace mwI {
  interface Jyuden {
    id: number;
    denno: number;
    jdstatus: string;
    jdshsta: string;
    torikbn: boolean;
    created_at: Date;
    created_by: string;
    updated_at: Date;
    updated_by: string;
    // del:boolean;
    mcode: string;
    scode: string;
    ncode: string;
    nadr: number;
    bunsho: number;
    day: Date;
    yday: Date;
    sday: Date;
    uday: Date;
    nday: Date;
    tcode: string;
    scd: string;
    skbn: string;
    jcode: string;
    pcode: string;
    hcode: string;
    hday: Date;
    htime: number;
    okurisuu: number;
    okurino: string;
    bikou: string;
    nbikou: string;
    obikou: string;
    sbikou: string;
    cusden: string;
    ryoate: string;
    daibiki: number;
    daibunrui: string;
    chubunrui: string;
    shobunrui: string;
    tcode1: string;
    gtotalzn: number;
    souryouzn: number;
    tesuuzn: number;
    nebikizn: number;
    taxtotal: number;
    total: number;
    genka: number;
    hgenka: number;
    egenka: number;
    // keep:string;
    // gtotal:number;
    // souryou:number;
    // tesuu:number;
    // nebiki:number;
    // ttotal:number;
    // tax:number;
    // syoukei:number;
    // okurinusi:string;
    // uttotal:number;
    // utax:number;
    // httotal:number;
    // total8:number;
    // total10:number;
  }
  interface Jmzai {
    eda: number;
    gcode: string;
    suu: number;
    spec: string;
    spdet: string;
  }
  interface Jyumei {
    line: number;
    gcode: string;
    gtext: string;
    suu: number;
    tanka: number;
    tinmoney: number;
    mbikou: string;
    spec: string;
    spdet: string;
    pable: number;
    genka: number;
    scode: string;
    sday: string;
    tanka1: number;
    money: number;
    mtax: number;
    tgenka: number;
    taxmoney: number;
    taxrate: number;
    currency: string;
    gskbn: string;
    unit: string;
    max: number;
    koguchi: number;
    ordering: boolean;
    send: string;
    vcode: string;
    gkbn: string;
    code: string;
    hgcode: string;
    msgzais: Gzai[];
    trjyumzais: Jmzai[];
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
  interface Trjyuden extends Jyuden {
    trjyumeis: Jyumei[];
  }
  interface Tropelog {
    sequ: number;
    keycode: string;
    extype: string;
    memo: string;
    created_by: string;
    created_at: Date;
    status: string;
    updated_by: string;
    updated_at: Date;
  }
  interface Trtreat {
    id: number;
    seq: number;
    created_at: Date;
    created_by: number;
    genre: string;
    mcode: string;
    grpcode: string;
    gcode: string;
    tel: string;
    email: string;
    question: string;
    answer: string;
    kaizen: string;
    result: string;
    trttype: string;
  }
  interface Hatden {
    id: number;
    denno: number;
    vcode: number;
    day: Date;
    scode: string;
    tcode: string;
    dbiko: string;
    inbiko: string;
    gtotal: number;
    ttotal: number;
    tax: number;
    total: number;
    created_at: string;
    created_by: Date;
    updated_at: string;
    updated_by: Date;
    // jdenno: number;
    currency: string;
    msvendor: {
      mtax: string;
      currency: string;
    }
  }
  interface Hatmei {
    line: number;
    day: string;
    inday: string;
    // soko:string;
    gcode: string;
    gtext: string;
    suu: number;
    genka: number;
    money: number;
    taxrate: string;
    // unit: string;
    mbiko: string;
    spec: string;
    jdenno: number;
    jline: number;
    yday: string;
    ydaykbn: string;
    mtax: string;
    msgood: {
      unit: string;
    }
  }
  interface Trhatden extends Hatden {
    vhatzns: Hatmei[];
  }
  interface Siiden {
    id: number;
    denno: number;
    vcode: number;
    inday: Date;
    scode: string;
    tcode: string;
    dbiko: string;
    gtotal: number;
    souryou: number;
    tesuu: number;
    tax: number;
    total: number;
    created_at: string;
    created_by: Date;
    updated_at: string;
    updated_by: Date;
    currency: string;
  }
  interface Siimei {
    line: number;
    inday: string;
    gcode: string;
    suu: number;
    genka: number;
    money: number;
    taxrate: string;
    // unit: string;
    mbiko: string;
    spec: string;
    hdenno: number;
    hline: number;
    mtax: string;
    msgood: {
      gtext: string;
      unit: string;
    }
  }
  interface Trsiiden extends Siiden {
    trsiimeis: Siimei[];
  }
  interface Zaiko {
    scode: string;
    gcode: string;
    day: string;
    suu: number;
  }
}