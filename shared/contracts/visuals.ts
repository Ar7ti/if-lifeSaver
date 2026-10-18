const groups: Record<string, {emoji:string; label:string; aliases:string[]}> = {
 sofa:{emoji:'🛋️',label:'Sofa',aliases:['sofas','couch','couches']}, bed:{emoji:'🛏️',label:'Bed',aliases:['beds','mattress','mattresses']},
 desk:{emoji:'🖥️',label:'Desk',aliases:['desks']}, chair:{emoji:'🪑',label:'Chair',aliases:['chairs']}, wardrobe:{emoji:'🚪',label:'Wardrobe',aliases:['wardrobes']},
 table:{emoji:'🪑',label:'Table',aliases:['tables']}, lamp:{emoji:'💡',label:'Lamp',aliases:['lamps','lighting']},
 car:{emoji:'🚗',label:'Vehicle',aliases:['cars','vehicle','vehicles','car_purchase','vehicle_purchase']}, train:{emoji:'🚆',label:'Train',aliases:['trains','rail']},
 bus:{emoji:'🚌',label:'Bus',aliases:['buses']}, flight:{emoji:'✈️',label:'Flight',aliases:['flights','airfare','tickets']}, bicycle:{emoji:'🚲',label:'Bicycle',aliases:['bicycles','bike','bikes']},
 apartment:{emoji:'🏢',label:'Apartment',aliases:['apartments','accommodation','hotel','hotels','hostel','housing']}, house:{emoji:'🏠',label:'Home',aliases:['houses','home','rent']}, utilities:{emoji:'🔌',label:'Utilities',aliases:['electricity','internet','broadband']},
 laptop:{emoji:'💻',label:'Laptop',aliases:['laptops','notebook']}, smartphone:{emoji:'📱',label:'Phone',aliases:['smartphones','phone','phones']}, monitor:{emoji:'🖥️',label:'Monitor',aliases:['monitors','screen']},
 groceries:{emoji:'🛒',label:'Groceries',aliases:['food']}, insurance:{emoji:'🛡️',label:'Insurance',aliases:['home_insurance','car_insurance']}, clothing:{emoji:'👕',label:'Clothing',aliases:['clothes']},
 moving:{emoji:'🚚',label:'Moving service',aliases:['movers','removals','van','truck','moving_company']}, appliances:{emoji:'🧊',label:'Appliance',aliases:['fridge','washer','refrigerator','oven']},
 furniture:{emoji:'🪑',label:'Furniture',aliases:[]}, services:{emoji:'🧰',label:'Service',aliases:['service','cleaning','assembly','delivery','inspection','registration']},
};
const lookup = new Map(Object.entries(groups).flatMap(([key,g])=>[key,...g.aliases].map(alias=>[alias,key] as const)));
const broad = new Set(['furniture','products','general','electronics','transport','essentials','purchase']);
/** Structured category first; a title may narrow a broad category, never a description. */
export function itemVisual(category:string,title='',kind?:'product'|'service') {
 const slug=category.toLowerCase().replace(/[\s-]+/g,'_');
 let key=lookup.get(slug);
 const tokens=slug.split('_').map(t=>lookup.get(t)).filter((v):v is string=>Boolean(v));
 if(!key&&new Set(tokens).size===1)key=tokens[0];
 if(broad.has(slug)){
  const specific=[...new Set(title.toLowerCase().split(/[^a-z]+/).map(t=>lookup.get(t)).filter((v):v is string=>Boolean(v)&&!broad.has(v!)))];
  if(specific.length===1)key=specific[0];
 }
 const visual=groups[key??''];
 return {category:key??'unknown',emoji:visual?.emoji??(kind==='service'?'🧰':'📦'),label:visual?.label??(kind==='service'?'Service':'Item')};
}
