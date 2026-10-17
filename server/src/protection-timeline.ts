import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ProtectionTimelineResponseSchema, type LifeProject, type ProtectionMilestone, type ProtectionMilestoneId, type ProtectionMilestonePatch, type ProtectionTimeline } from '../../shared/contracts/index.js';
import { AppError } from './errors.js';

const ROOT='https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus';
export const MOVING_PROTECTION_RESOURCES={
  moving:ROOT+'/muuttaminen',checklist:ROOT+'/muuttaminen/muuttajan-muistilista',
  update:ROOT+'/muuttaminen/muuttoilmoitus',safety:ROOT+'/kodin-turvallisuus',
} as const;

/** Calendar dates are evaluated in UTC, never by parsing a local midnight or adding local hours. */
export function addCalendarDays(value:string,offset:number):string {
  z.string().date().parse(value);
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(0);date.setUTCFullYear(year!,month!-1,day!);date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate()+offset);
  return z.string().date().parse(date.toISOString().slice(0,10));
}
const definitions:Array<Omit<ProtectionMilestone,'status'|'completedAt'|'contextFingerprint'|'suggestedDate'>&{offset:number}>=[
  {id:'home_review',phase:'before',offset:-14,timing:'About 2 weeks before',title:'Review your existing home protection',
    explanation:'If says its home insurance does not automatically transfer to a new home. If you are insured elsewhere, check your own provider’s moving process.',
    overlooked:'An address update alone may leave the new home details or start date unconfirmed.',
    steps:['Check which insurer you use and what needs updating for the new home.','Read the applicable terms; a saved review here is not proof of active cover.'],
    resource:{title:'Read If’s moving guidance',url:MOVING_PROTECTION_RESOURCES.update},reviewAction:true},
  {id:'transport_check',phase:'before',offset:-7,timing:'About 1 week before',title:'Check protection during transportation',
    explanation:'Protection for belongings in transit depends on the policy and how the move is carried out.',
    overlooked:'You could rely on protection or a mover’s responsibility that has not been confirmed.',
    steps:['Ask your insurer about the applicable moving and transport terms.','If you use movers, request written handling, damage-reporting and responsibility terms.'],
    resource:{title:'Read If’s moving information',url:MOVING_PROTECTION_RESOURCES.moving},reviewAction:false},
  {id:'confirm_details',phase:'before',offset:-1,timing:'Before moving day',title:'Confirm the new home details',
    explanation:'Check the address, dwelling details and intended protection start date against your actual arrangements.',
    overlooked:'A saved quote or checklist tick may be mistaken for a policy that has been updated or purchased.',
    steps:['Review the new address and the date with your insurer.','Keep the provider’s confirmation where you can find it. This app does not verify policy activation.'],
    resource:{title:'Read about updating If home insurance',url:MOVING_PROTECTION_RESOURCES.update},reviewAction:true},
  {id:'moving_day',phase:'during',offset:0,timing:'On moving day',title:'Protect belongings and keep documentation',
    explanation:'Careful packing and a clear record of condition make the move easier to organize.',
    overlooked:'Poorly identified boxes or missing condition notes can make damage and handover questions harder to resolve.',
    steps:['Protect fragile items, label boxes and keep access routes clear.','Photograph important belongings and record any damage or handover concerns.'],
    resource:{title:'Read If’s moving checklist',url:MOVING_PROTECTION_RESOURCES.checklist},reviewAction:false},
  {id:'home_safety',phase:'after',offset:3,timing:'A few days after',title:'Check safety in your new home',
    explanation:'A short safety check helps you spot visible problems as you settle in.',
    overlooked:'A faulty smoke alarm or visible signs of leaking water may go unnoticed.',
    steps:['Check smoke alarms and clear escape routes.','Look for visible leaks around appliances; report concerns to the responsible person. Do not attempt unsafe repairs.'],
    resource:{title:'Read If’s home safety guidance',url:MOVING_PROTECTION_RESOURCES.safety},reviewAction:false},
];

function context(project:LifeProject,id:ProtectionMilestoneId){
  const d=project.homeInsurance?.details;
  // Transport and policy reviews are date-sensitive. Practical preparation remains reviewed
  // after a date-only edit, but a changed destination still deserves another look.
  const scoped=id==='transport_check'?{origin:project.preferences.origin,destination:project.location,date:project.preferences.moveDate}
    :id==='moving_day'?{origin:project.preferences.origin,destination:project.location}
    :{destination:project.location,home:d?{street:d.streetAddress,city:d.city,postalCode:d.postalCode,livingSpace:d.livingSpace,type:d.householderType}:null,
      ...(id==='home_safety'?{}:{date:project.preferences.moveDate,startDate:d?.startDate,policyHolderPostalCode:d?.policyHolderPostalCode})};
  return createHash('sha256').update(JSON.stringify(scoped)).digest('hex');
}
export function movingProtectionTimeline(project:LifeProject,today=new Date().toISOString().slice(0,10)):ProtectionTimeline {
  if(project.scenarioType!=='moving')throw new AppError('PROTECTION_TIMELINE_UNSUPPORTED','Protection Timeline is available for moving projects only.',422);
  z.string().date().parse(today);
  const review=project.protection?.recommendations.find(r=>r.insuranceType==='home')?.status??'suggested';
  const reviewNote=review==='dismissed'?'You postponed home protection review. Reopen it only when you are ready.'
    :review==='already_insured_self_reported'?'You reported existing cover. Your policy and its suitability for this move have not been verified here.'
    :review==='reviewed'?'You marked home protection as reviewed. This is not independent confirmation of active cover.'
    :review==='quote_available'?'A home quote is saved. A quote is not a purchased or active policy.'
    :['quote_expired','quote_unavailable'].includes(review)?'The saved home price needs review. Check the current details with your insurer.'
    :review==='in_progress'?'Your home protection review is in progress. No active cover has been verified here.'
    :'Insurance has not been checked in this workspace. Review your existing arrangements when useful.';
  const milestones=definitions.map(({offset,...item}):ProtectionMilestone=>{
    const suggestedDate=project.preferences.moveDate?addCalendarDays(project.preferences.moveDate,offset):null;
    const fingerprint=context(project,item.id);const record=project.protectionTimeline?.records.find(r=>r.id===item.id);
    const status=record?.completedAt?(record.completedContext===fingerprint?'completed':'needs_review')
      :!suggestedDate||suggestedDate===today?'ready':suggestedDate<today?'past_suggested_date':'upcoming';
    return {...item,suggestedDate,status,contextFingerprint:fingerprint,completedAt:record?.completedAt??null};
  });
  return ProtectionTimelineResponseSchema.parse({scenario:'moving',destination:project.location,origin:project.preferences.origin,moveDate:project.preferences.moveDate,
    asOfDate:today,reviewStatus:review,reviewNote,completed:milestones.filter(m=>m.status==='completed').length,total:5,milestones});
}
export function updateProtectionMilestone(project:LifeProject,id:ProtectionMilestoneId,patch:ProtectionMilestonePatch,at=new Date().toISOString()) {
  const milestone=movingProtectionTimeline(project,at.slice(0,10)).milestones.find(m=>m.id===id)!;
  if(patch.expectedContextFingerprint!==milestone.contextFingerprint)throw new AppError('CONFLICT','Your moving details changed. Review the latest timeline before updating this step.',409);
  project.protectionTimeline??={version:1,records:[]};
  let record=project.protectionTimeline.records.find(r=>r.id===id);
  if(!record){record={id,completedAt:null,completedContext:null,history:[]};project.protectionTimeline.records.push(record);}
  if(patch.completed&&record.completedAt&&record.completedContext===milestone.contextFingerprint||!patch.completed&&!record.completedAt)return;
  record.completedAt=patch.completed?at:null;record.completedContext=patch.completed?milestone.contextFingerprint:null;
  record.history=[...record.history,{at,action:patch.completed?'completed' as const:'reopened' as const,contextFingerprint:milestone.contextFingerprint}].slice(-20);
}
