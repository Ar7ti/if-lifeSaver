/** Discovery hints only. These sites are NOT API integrations or permission to
 * scrape. All discovery uses the existing hosted tool; no direct fetch occurs. */
export const SOURCE_STRATEGIES={
  used_furniture:{domains:['tori.fi','huuto.net'],terms:'käytetty myydään',access:'hosted_search_only'},
  new_goods:{domains:['ikea.com','jysk.fi'],terms:'uusi tuote hinta',access:'hosted_search_only'},
  rental:{domains:['vuokraovi.com','asunnot.oikotie.fi','lumo.fi'],terms:'vuokra asunto kuukausivuokra',access:'hosted_search_only'},
  car:{domains:['nettiauto.com','kamux.fi','saka.fi'],terms:'vaihtoauto myydään',access:'hosted_search_only'},
  transport:{domains:['vr.fi','matkahuolto.fi','onnibus.com'],terms:'juna bussi aikataulu lippu',access:'hosted_search_only'},
  moving:{domains:[],terms:'muuttopalvelu tarjous kuljetus',access:'hosted_search_only'},
  insurance:{domains:['if.fi'],terms:'kotivakuutus ehdot turva',access:'hosted_search_only'},
  information:{domains:[],terms:'official guidance primary source',access:'hosted_search_only'},
  generic:{domains:[],terms:'specific listing price source',access:'hosted_search_only'},
} as const;

type Input={category:string;focus:string;condition:string;purpose:string;location:string|null;origin:string|null;ceilingMinor:number|null;period:string;dates:{startDate?:string|null;endDate?:string|null;moveDate?:string|null;durationDays?:number|null};travelers?:number|null;attributes:string[]};
const words:Record<string,string>={sofa:'sohva',bed:'sänky patja',desk:'työpöytä',chair:'tuoli',table:'pöytä',wardrobe:'vaatekaappi',vehicle:'auto',housing:'vuokra asunto',accommodation:'majoitus hotelli',transport:'juna bussi',furniture:'huonekalut'};
export function researchStrategy(input:Input,registry=SOURCE_STRATEGIES){
 const fi=!!input.location&&/\b(?:Finland|Suomi|Turku|Helsinki|Tampere|Espoo|Vantaa|Oulu|Jyväskylä|Kuopio)\b/i.test(input.location);
 const furniture=!!words[input.category]&&['sofa','bed','desk','chair','table','wardrobe','furniture'].includes(input.category);
 const id: keyof typeof SOURCE_STRATEGIES=input.focus==='insurance'?'insurance':input.purpose==='information'?'information':input.focus==='rental'?'rental':input.focus==='car'?'car':input.focus==='travel_transport'?'transport':input.focus==='moving'?'moving':furniture&&input.condition==='used'?'used_furniture':furniture||input.focus==='bed'?'new_goods':'generic';
 const source=registry[id],domains=fi||id==='insurance'?source.domains:[];
 const item=fi?`${input.category} ${words[input.category]??''}`.trim():input.category.replaceAll('_',' ');
 const place=[input.origin&&`from ${input.origin}`,input.location].filter(Boolean).join(' to ');
 const budget=input.ceilingMinor===null?'':`under EUR ${(input.ceilingMinor/100).toFixed(2)}${input.period==='month'?' per month':''}`;
 const dates=[input.dates.startDate,input.dates.endDate,input.focus==='moving'?input.dates.moveDate:null,input.dates.durationDays?`${input.dates.durationDays} days`:null,input.travelers?`${input.travelers} travelers`:null].filter(Boolean).join(' ');
 const constraints=[input.condition==='any'?'':input.condition,item,place,budget,dates,input.attributes.slice(0,4).join(' ')].filter(Boolean).join(' ').slice(0,650);
 // Three priority stages inside the SAME bounded hosted-tool response. Queries
 // do not authorize broadening location/price/condition in final validation.
 const queries=[
  `${domains[0]?`site:${domains[0]} `:''}${fi?source.terms+' ':''}${constraints}${id==='car'?' -toy -rental -lease':''}`,
  `${domains[1]?`site:${domains[1]} `:''}${input.category==='sofa'?'sofa couch sohva ':''}${constraints} specific listing condition price`,
  `${constraints} ${id==='insurance'?'site:if.fi official guidance':id==='transport'?'official operator route fare':id==='used_furniture'?'second hand marketplace myydään':'alternative direct sources'}`,
 ].map(q=>q.trim().slice(0,900));
 return {id,access:source.access,sourceHints:[...domains],queries,stages:['exact','alternative_source','coverage'] as const,maximumHostedToolCalls:3};
}
