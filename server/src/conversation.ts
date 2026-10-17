import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {PreferencesSchema,ClarificationFieldSchema,type ClarificationField,type Clarification,type LifeProject,type ProjectPatch} from '../../shared/contracts/index.js';
import {buildScenarioProfile,parseExplicitBudget} from './scenario-profile.js';

export const InterpretationSchema=z.object({classification:z.enum(['IN_SCOPE','CONTEXTUAL_FOLLOW_UP','OUT_OF_SCOPE','AMBIGUOUS']),intent:z.enum(['research','answer','workspace','planning','new_project']),facts:z.array(z.object({field:ClarificationFieldSchema,value:z.string().max(500),evidence:z.string().min(1).max(2000)}).strict()).max(12),clarification:z.object({field:ClarificationFieldSchema,question:z.string().min(1).max(500)}).strict().nullable(),reply:z.string().max(2000)}).strict();
export type Interpretation=z.infer<typeof InterpretationSchema>;
export type Facts={budgetMinor?:number;location?:string;preferences?:NonNullable<ProjectPatch['preferences']>};
const now=()=>new Date().toISOString();
export function conversation(project:LifeProject){return project.conversation??={id:randomUUID(),activeRequest:null,turns:[],clarifications:[]};}
export function appendTurn(project:LifeProject,role:'user'|'assistant',content:string){const state=conversation(project);state.turns=[...state.turns,{id:randomUUID(),role,content:content.slice(0,4000),createdAt:now()}].slice(-12);}
export function fieldForQuestion(question:string,project:Pick<LifeProject,'scenarioType'>):ClarificationField {
 const q=question.toLowerCase();
 if(/budget|how much.*spend/.test(q))return 'budget';
 if(/already.*(?:own|have).*furniture|own furniture/.test(q))return 'ownsFurniture';
 if(/(?:items|furniture).*already|already.*(?:items|bed|desk)/.test(q))return 'ownedItems';
 if(/where.*from|origin|departure (?:city|location)/.test(q))return 'origin';
 if(/where|destination|which city/.test(q))return 'destination';
 if(/return date|end date/.test(q))return 'endDate';
 if(/when|start|date/.test(q))return project.scenarioType==='moving'?'moveDate':'startDate';
 if(/how long|duration|how many days/.test(q))return 'durationDays';
 if(/how many|household|travelers|travellers/.test(q))return project.scenarioType==='moving'?'householdSize':'travelers';
 if(/how.*use.*car|use case/.test(q))return 'useCase';
 if(/vehicle|type of car/.test(q))return 'vehicleType';
 return 'context';
}
export function knownField(project:LifeProject,field:ClarificationField):boolean {
 if(field==='budget')return project.budget.confirmed;
 if(field==='destination')return !!project.location;
 if(field==='context')return false;
 const value=project.preferences[field];return value!==undefined&&value!==null&&value!==''&&(!Array.isArray(value)||value.length>0);
}
export function pendingClarification(project:LifeProject){
 const state=project.conversation;const previous=state?.turns.findLast(turn=>turn.role==='assistant');
 const question=previous?.content.match(/[^.!?\n]*\?/g)?.at(-1);
 const lastAsked=question?state?.clarifications.findLast(c=>c.status==='pending'&&c.field===fieldForQuestion(question,project)):undefined;
 return lastAsked??state?.clarifications.findLast(c=>c.status==='pending'&&c.field==='context')??state?.clarifications.find(c=>c.status==='pending');
}
export function askClarification(project:LifeProject,field:ClarificationField,question:string,request:string):{clarification:Clarification;repeated:boolean}{
 const state=conversation(project);const previous=state.clarifications.findLast(c=>c.field===field&&c.status==='pending');
 if(previous){previous.attempts=Math.min(3,previous.attempts+1);previous.updatedAt=now();return {clarification:previous,repeated:true};}
 const stamp=now();const clarification:Clarification={id:randomUUID(),field,question:question.slice(0,500),status:'pending',createdAt:stamp,updatedAt:stamp,context:{scenarioType:project.scenarioType,request:request.slice(0,2000)},answer:null,attempts:1};
 state.clarifications.push(clarification);state.clarifications=[...state.clarifications.filter(c=>c.status!=='pending').slice(-25),...state.clarifications.filter(c=>c.status==='pending').slice(-15)];return {clarification,repeated:false};
}
export function resolveClarification(project:LifeProject,entry:Clarification,status:Clarification['status'],answer:string){entry.status=status;entry.answer=answer.slice(0,2000);entry.updatedAt=now();if(status==='answered'){project.answeredQuestions??={};project.answeredQuestions[entry.question]=answer.slice(0,2000);}}
export function reconcileClarifications(project:LifeProject){
 const state=conversation(project);
 for(const entry of state.clarifications)if(entry.status==='pending'&&entry.context.scenarioType!==project.scenarioType)resolveClarification(project,entry,'superseded','Project intent was reconciled with the original goal');
 for(const entry of state.clarifications)if(entry.status==='pending'&&(knownField(project,entry.field)||project.answeredQuestions?.[entry.question]))resolveClarification(project,entry,'answered',project.answeredQuestions?.[entry.question]??'Saved in project details');
 for(const question of project.questions){const field=fieldForQuestion(question,project);if(field==='context'||knownField(project,field)||project.answeredQuestions?.[question])continue;if(!state.clarifications.some(c=>c.field===field&&c.status==='pending'))askClarification(project,field,question,state.activeRequest??project.originalMessage);}
}
export function normalizePlanningMessage(message:string){return message.replace(/\bavia\s*tickets?\b|\bplane tickets?\b|\bair(?:line)? tickets?\b/gi,'flights').replace(/\b(?:some\s*where|some\s+place|a\s+place|place)\s+(?:cheap\s+)?to\s+sleep\b/gi,'accommodation').replace(/\b(?:wanna|want to) chill\b/gi,'want to relax on this trip');}
export const affirmative=(message:string)=>/^(?:(?:yes|yeah|yep|yup|ok|okay|sure|correct|right|exactly|indeed|affirmative|it is|that is right|of course|please do)(?:[\s,!.]+|$))+(?:it is|that(?:'s| is) right|please|do it|continue|go ahead)?[\s!.]*$/i.test(message.trim());
export const negative=(message:string)=>/^(?:no|nope|not really|not that|different project)[\s!.]*$/i.test(message.trim());
export const dismisses=(message:string)=>/^(?:skip|dismiss|not now|later|skip (?:that|this|it|question))(?:\s+(?:question|please|for now))?[.! ]*$/i.test(message.trim());
function bareMoney(message:string){return /^(?:(?:€|EUR)\s*[\d.,\s]+|[\d.,\s]+\s*(?:€|EUR|euros?))[.! ]*$/i.test(message.trim());}
export function extractFacts(project:LifeProject,message:string,pending=pendingClarification(project)):Facts{
 const normalized=normalizePlanningMessage(message);const profile=buildScenarioProfile({message:normalized,scenarioType:project.scenarioType});
 const prefs:NonNullable<ProjectPatch['preferences']>={};
 for(const key of ['origin','moveDate','startDate','endDate','durationDays','travelers','householdSize','ownsFurniture','allowUsed','deliveryRequired','vehicleType'] as const){const value=profile.preferences[key];if(value!==undefined&&value!==null)Object.assign(prefs,{[key]:value});}
 if(profile.preferences.ownedItems?.length)prefs.ownedItems=[...new Set([...(project.preferences.ownedItems??[]),...profile.preferences.ownedItems])];
 if(prefs.origin&&pending?.field!=='origin'&&!/^\s*from\b/i.test(message)&&!/\b(?:travel|trip|fly|flight|leaving|depart|moving|move|coming|start|origin|i'm|i am)[^.!?]{0,50}\bfrom\b/i.test(message))delete prefs.origin;
 if(prefs.vehicleType&&project.preferences.vehicleType&&pending?.field!=='vehicleType'&&!/\b(?:type|prefer|want|looking for)\b/i.test(message))delete prefs.vehicleType;
 const facts:Facts={};const amount=bareMoney(message)?parseExplicitBudget(message):profile.budgetMinor;
 if(amount!==null&&(bareMoney(message)||/\bbudget|can spend|spending limit|have (?:only )?(?:€|EUR)/i.test(message)))facts.budgetMinor=amount;
 if(profile.location&&/\b(?:to|destination|in|near|around)\b/i.test(message))facts.location=profile.location;
 if(pending){
  const text=message.trim();const field=pending.field;
  if(field==='budget'&&/^(?:€|EUR\s*)?\s*\d[\d.,\s]*(?:\s*(?:€|EUR|euros?))?[.! ]*$/i.test(text)){
   const parsed=buildScenarioProfile({message:`My budget is ${text}`}).budgetMinor;if(parsed!==null)facts.budgetMinor=parsed;
  }
  if(['destination','origin'].includes(field)&&!profile.location&&!/\d|[?!]|\b(?:find|show|need|help|budget|cheaper|yes|no|yeah|it is)\b/i.test(text)&&text.length<120&&/^[\p{L}][\p{L} ,'-]+[.]?$/u.test(text)){
   if(field==='destination')facts.location=text.replace(/\.$/,'');else prefs.origin=text.replace(/\.$/,'');
  }
  if(field==='ownsFurniture'&&(affirmative(text)||negative(text)))prefs.ownsFurniture=affirmative(text);
  if(['travelers','householdSize','durationDays'].includes(field)&&(/^[0-9]{1,3}[.! ]*$/.test(text)||Object.hasOwn(wordNumbers,text.toLowerCase().replace(/[.!]/g,'')))){const n=wordNumbers[text.toLowerCase().replace(/[.!]/g,'')]??Number(text.replace(/[.! ]/g,''));if(n>=1&&n<=(field==='durationDays'?366:30))Object.assign(prefs,{[field]:n});}
  if(['vehicleType','useCase'].includes(field)&&text.length<=100&&!affirmative(text)&&!negative(text)&&!/[?]|\b(?:find|show|help|cheaper)\b/i.test(text))Object.assign(prefs,{[field]:text});
 }
 if(Object.keys(prefs).length)facts.preferences=PreferencesSchema.partial().parse(prefs);return facts;
}
/** Accept model facts only when backed by the user's current words, never model assumptions. */
const wordNumbers:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
export function groundedInterpretationFacts(project:LifeProject,message:string,interpretation:Interpretation):Facts{
 let result=extractFacts(project,message);const prefs={...result.preferences};
 for(const fact of interpretation.facts){
  if(!message.toLowerCase().includes(fact.evidence.toLowerCase()))continue;
  const field=fact.field;const value=fact.value.trim();
  if(field==='budget'){if(!bareMoney(message)&&!/\bbudget|can spend|spending limit/i.test(message)&&pendingClarification(project)?.field!=='budget')continue;const amount=buildScenarioProfile({message:`My budget is ${fact.evidence}`}).budgetMinor;if(amount!==null&&amount===Number(value))result.budgetMinor=amount;continue;}
  if(field==='destination'||field==='origin'||field==='vehicleType'||field==='useCase'){
   if(!fact.evidence.toLowerCase().includes(value.toLowerCase()))continue;
   if(field==='destination')result.location=value;else Object.assign(prefs,{[field]:value});
  }
  if(['travelers','householdSize','durationDays'].includes(field)){const n=Number(value);const tokens=fact.evidence.toLowerCase().split(/[^a-z0-9]+/);if(Number.isInteger(n)&&(tokens.includes(String(n))||Object.entries(wordNumbers).some(([word,count])=>count===n&&tokens.includes(word))))Object.assign(prefs,{[field]:n});}
  if(field==='ownsFurniture'&&['true','false'].includes(value)&&((pendingClarification(project)?.field==='ownsFurniture'&&(affirmative(fact.evidence)||negative(fact.evidence)))||/\b(?:own|have|no|need)\b.*furniture/i.test(fact.evidence)))prefs.ownsFurniture=value==='true';
  if(field==='ownedItems'){const items=value.split(',').map(v=>v.trim()).filter(Boolean);if(items.length&&items.every(item=>fact.evidence.toLowerCase().includes(item.toLowerCase())))prefs.ownedItems=[...new Set([...(prefs.ownedItems??project.preferences.ownedItems??[]),...items])];}
  if(['startDate','endDate','moveDate'].includes(field)&&z.string().date().safeParse(value).success&&fact.evidence.includes(value.slice(0,4))){const date=Date.parse(fact.evidence);if(fact.evidence.includes(value)||(!Number.isNaN(date)&&new Date(date).toISOString().slice(0,10)===value))Object.assign(prefs,{[field]:value});}
 }
 if(Object.keys(prefs).length)result.preferences=PreferencesSchema.partial().parse(prefs);return result;
}
export function compactConversation(project:LifeProject){return {id:project.conversation?.id,pending:project.conversation?.clarifications.filter(c=>c.status==='pending').map(c=>({id:c.id,field:c.field,question:c.question,originalRequest:c.context.request})),recentTurns:project.conversation?.turns.slice(-6),activeRequest:project.conversation?.activeRequest};}
