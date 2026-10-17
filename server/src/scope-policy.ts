import type { LifeProject } from '../../shared/contracts/index.js';

export type ScopeClass='IN_SCOPE'|'CONTEXTUAL_FOLLOW_UP'|'OUT_OF_SCOPE'|'AMBIGUOUS';
export interface ScopeDecision {classification:ScopeClass;reply?:string;reason:string}
const redirect="I help with life plans, purchases, budgets, travel and everyday decisions. I can help you find a course or budget for learning, but general programming tutorials are outside this workspace.";
const LIFE=/\b(move|moving|relocat\w*|housing|apartment|furnish\w*|furniture|bed\w*|sofa\w*|household|home|travel\w*|trip|holiday|vacation|flight\w*|hotel\w*|accommodation|itinerary|car\w*|vehicle\w*|commut\w*|transport\w*|budget\w*|purchase\w*|shopping|buy\w*|sell\w*|seller\w*|deliver\w*|insurance|registration|rent\w*|lease|utilit\w*|packing|university|college|student|school|education|course\w*|learning plan|job|career|wedding|event|retire\w*|childcare|family|healthcare|appointment|checklist|life plan|life decision)\b/i;
const COURSE_PLAN=/\b(find|choose|compare|enrol\w*|register|budget|cost|pay|afford|schedule|plan|organize)\b[\s\S]{0,100}\b(course|courses|university|college|school|study|studies|education|learning)\b|\b(course|courses|education|learning|university)\b[\s\S]{0,80}\b(budget|cost|schedule|plan|fees|enrol\w*)\b/i;
const TUTORING=/\b(teach|explain|tutorial|debug|code|coding|programming|script|function|algorithm|calculate|solve|translate|write|implement|generate)\b[\s\S]{0,120}\b(python|javascript|typescript|java|c\+\+|rust|sql|react|html|css|code|programming|scripts?|algorithms?|equation|poem|essay|story|lyrics)\b|\bhow (?:do|can|to)\b[\s\S]{0,70}\b(write|code|program|debug)\b/i;
const DIRECT_TUTORING=/\b(?:teach|explain|write|debug|implement|generate|code|give|show)\s+(?:(?:me|us|a|an|my|the|first|basic|how|to|in|some|simple)\s+){0,6}(?:python|javascript|typescript|java|c\+\+|rust|sql|react|html|css|programming|code|scripts?)\b/i;
const BYPASS=/\b(ignore|forget|disregard|override)\b[\s\S]{0,70}\b(instructions?|role|rules?|scope|system|previous)\b|\b(?:act|pretend|behave) as\b[\s\S]{0,50}\b(general|unrestricted|chatgpt|programming|developer|coder)\b/i;
const SAFETY=/\b(suicid\w*|kill myself|hurt myself|self.harm|overdos\w*|immediate danger|emergency|gas leak|fire in|being abused|domestic violence|unsafe|scam\w*|fraud\w*|stalk\w*|stolen|accident|injur\w*)\b/i;
const FOLLOW=/\b(cheaper|better|another|alternative\w*|option\w*|that one|this one|those|these|compare|show|hide|widget|workspace|task\w*|risk\w*|reserve|allocation|reallocat\w*|save|plan|date|date\w*|cheapest|local sellers|recommend\w*|draft|confirm|yes|no)\b/i;
const HARMFUL=/\b(make|build|create|carry|buy)\b[\s\S]{0,50}\b(bomb|explosive|weapon)\b|\b(hack|steal|phish)\b[\s\S]{0,70}\b(account|password|bank|money)\b/i;

/** The server gate runs before any model/provider call and before mutations.
 * Positive life context never whitelists an embedded unrelated tutorial request. */
export function classifyScope(message:string,project?:Pick<LifeProject,'scenarioType'|'originalMessage'>):ScopeDecision {
 const text=message.trim();
 if(SAFETY.test(text)&&!HARMFUL.test(text))return {classification:'IN_SCOPE',reason:'Safety-related assistance remains available'};
 if(HARMFUL.test(text))return {classification:'OUT_OF_SCOPE',reason:'Unsafe external actions',reply:'I can help with practical safety and risk prevention, but cannot help carry out harmful actions.'};
 if(BYPASS.test(text))return {classification:'OUT_OF_SCOPE',reason:'Attempt to override the product role',reply:redirect};
 if(COURSE_PLAN.test(text)&&!DIRECT_TUTORING.test(text)&&!/(?:then|also|and)\s+(?:teach|explain|write|debug)\b/i.test(text))return {classification:'IN_SCOPE',reason:'Education logistics and budgeting are life planning'};
 if(TUTORING.test(text))return {classification:'OUT_OF_SCOPE',reason:'General technical or creative tutoring',reply:redirect};
 if(LIFE.test(text))return {classification:'IN_SCOPE',reason:'Practical life decision'};
 if(project&&FOLLOW.test(text))return {classification:'CONTEXTUAL_FOLLOW_UP',reason:'Follow-up resolves against the saved project'};
 if(/^(thanks?|thank you|hello|hi|hey|ok(?:ay)?)[!. ]*$/i.test(text))return {classification:'CONTEXTUAL_FOLLOW_UP',reason:'Conversational acknowledgment',reply:'I can help with your current plan. What would you like to work on next?'};
 return {classification:'AMBIGUOUS',reason:'No clear supported goal',reply:project?'Is this about your current plan, or another real-life decision you want to organize?':'What real-life goal would you like to plan—for example a trip, a purchase, starting university or a move?'};
}
