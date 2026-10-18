/** Project money is EUR cents; product offers retain their currency and exponent. */
const whole = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(minor: number | null | undefined, opts: { exact?: boolean; currency?: string|null } = {}) {
  if (minor === null || minor === undefined) return 'Unknown';
  if(opts.currency===null)return `${minor} minor units · currency unknown`;
  if(opts.currency&&opts.currency!=='EUR'){const exponent=opts.currency==='JPY'?0:2;return new Intl.NumberFormat('en-IE',{style:'currency',currency:opts.currency,maximumFractionDigits:exponent}).format(minor/10**exponent);}
  const value = minor / 100;
  return opts.exact || minor % 100 !== 0 ? cents.format(value) : whole.format(value);
}

/** Euros typed by a person → integer cents. Returns null for empty or invalid input. */
export function parseEuros(input: string): number | null {
  const normalized = input.replace(/\s/g, '').replace(',', '.').replace(/[€]/g, '');
  if (normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function centsToInput(minor: number) {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatDate(value: string | null | undefined, short = false) {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  return short ? shortDate.format(d) : dateFmt.format(d);
}

export function formatTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}

export function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return formatDate(value) ?? '';
}

const plural = new Intl.PluralRules('en');
/** English-only UI: forms are "one" and "other". A translated UI would move these into ICU messages. */
export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${plural.select(n) === 'one' ? one : many}`;
}

/** Category ids are slugs like "beds" or "moving_services". */
export function humanizeCategory(id: string) {
  const s = id.replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
