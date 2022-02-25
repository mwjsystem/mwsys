declare namespace mwI {
  interface Tbldef {
    table_name: string;
    column_name: string;
    description: string;  
  }


  interface Sval {
    value: string;
    viewval: string;
    // dis:boolean;
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
    numbering:boolean;  
  }

  interface Hktime {
    hscode: number;
    code:   string;
    name:   string;
    bunrui: string;   
  }
  interface Mcode {
    mcode:string;
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
    mcode:string;
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
    nbikou:string;
    sbikou:string;
    obikou:string;
    del:boolean;
    target:boolean;
  }
  interface Member {
    mcode:string;
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
    scode:string;
    pcode:string;
    hcode:string;
    jcode:string;
    mtax:string;
    sscode:string;
    tcode1:string;
    tcode:string;
    del:boolean;
    bikou:string;
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
    ryoate:string;
    mtgt1:boolean;
    mtgt2:boolean;
    mtgt3:boolean;
    mtgt4:boolean;
    mtgt5:boolean;
    gadr:string;
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
    msgoods:{gtext:string;
             unit:string;
             gskbn:string;};
  }
  interface Goods {
    gcode:string;
    size:string;
    color:string;
    gskbn:string;
    jan:string;
    weight:number;
    unit:string;
    tkbn:string;
    gtext:string;
    max:number;
    send:string;
    ordering:boolean;
    koguchi:number;
    lot:number;
    vgcode:string;
    hgcode:string;
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
    category:string;
    subcat:string;
    msgoods:Msgoods[];    
  }
  
  interface Bunrui {
    kubun:number;
    value:string;
    viewval:string;
    memo:string;
  }
  
  interface Staff {
    code:string;
    mail:string;
    sei:string;
    mei:string;
    scode:string;
  }
}