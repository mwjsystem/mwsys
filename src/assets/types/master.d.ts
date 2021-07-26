declare namespace mwI {
  interface Tbldef {
    table_name: string;
    column_name: string;
    description: string;  
  }


  interface Sval {
    value: string;
    viewval: string;  
  }

  interface Bunsho {
    code: number;
    name: string;
    title:string;
    gakutxt:string;
    stamp:boolean;
    atesaki:string;
    message:string;
    second:number;
    include:number;    
  }

  interface Hokuri {
    code:   number;
    name:   string;
    htype:  string;
    binshu: string;
    mtchaku:string;
    daibiki:boolean;
    scode:  string;
    csvimp: string;
    cuscode:string;
    ordering:  string; 
    hscode: number;
    onmin:  number;
    onmax:  number;
  }

  interface Haisou {
    code: number;
    name: string;
    url:  string;   
  }

  interface Hktime {
    hscode: number;
    code:   string;
    name:   string;
    bunrui: string;   
  }
  interface Mcode {
    mcode:number;
    sei:string;
    mei:string;
    del:boolean;
  }
  interface Vendor {
    code:string;
    adrname:string;
    kana:string;
    mtax:string;
    currency:string;
    tel:string;
    tel2:string;
    tel3:string;
    fax:string;
    mail1:string;
    mail2:string;
    mail3:string;
    mail4:string;
    mail5:string;
    tanto:string;
    url:string;
    del:string;
    zip:string;
    region:string;
    local:string;
  }
  interface Stit {
    id:number;
    mcode:number;
    patno:number;
    seq:number;
    stitype:string;
    stitno:string;
    vcode:string;
    biko:string;
    size:string;
    color:string;
    colorno:number;
    letter:string;
    position:string;
    posibikou:string;
  }   
  interface Adrs {
    eda:number;
    zip:string;
    region:string;
    local:string;
    street:string;
    extend:string;
    extend2:string;
    adrname:string;
    tel:string;
    fax:string;
    tel2:string;
    tel3:string;
    adrbikou:string;
    adrinbikou:string;
    adrokrbko:string;
    del:boolean;
  }
  interface Member {
    mcode:number;
    sei:string;
    mei:string;
    kana:string;
    tankakbn:string;
    mail:string;
    mail2:string;
    mail3:string;
    mail4:string;
    mail5:string;
    torikbn:boolean;
    sime:number;
    site:string;
    inday:number;
    scode:number;
    bikou:string;
    inbikou:string;
    pcode:string;
    hcode:string;
    mtax:string;
    sscode:number;
    tcode1:string;
    tcode:string;
    del:boolean;
    sptnkbn:string;
    daibunuri:string;
    chubunrui:string;
    shobunrui:string;
    created_at:Date;
    updated_at:Date;
    lday:Date;
    created_by:string;
    updated_by:string;
    ntype:number;
    tntype:number;
    webid:string;
    msmadrs:Adrs[];
    msmstits:Stit[];
  }
  interface Gtanka {
    gcode:string;
    day:Date;
    tanka1:number;
    tanka2:number;
    tanka3:number;
    tanka4:number;
    tanka5:number;
    tanka6:number;
    tanka7:number;
    tanka8:number;
    tanka9:number;
    taxrate:number;
    genka:number;
    currency:string;
    cost:number;
  }
  interface Gzai {
    zcode:string;
    irisu:number;
  }
  interface Goods {
    gcode:string;
    size:string;
    color:string;
    irisu:number;
    gskbn:number;
    jan:string;
    weight:number;
    iriunit:string;
    tkbn:number;
    zkbn:number;
    gtext:string;
    max:number;
    send:string;
    ordering:boolean;
    koguchi:number;
    lot:number;
    msgzais:Gzai[];
  }
  
  interface Msgoods extends Goods{
    msgtankas:Gtanka[];
  }

  interface Ggroup {
    code:string;
    kana:string;
    name:string;
    gkbn:string;
    bikou:string;
    sozai:string;
    created_at:Date;
    created_by:string;
    updated_at:Date;
    updated_by:string;
    vcode:string;
    tcode:string;
    specurl:string;
    genre:string;
    msgoods:Msgoods[];    
  }
  
  interface Bunrui {
    kubun:number;
    code:string;
    name:string;
    memo:string;
  }
  interface Staff {
    code:string;
    mail:string;
    sei:string;
    mei:string;
  }
}