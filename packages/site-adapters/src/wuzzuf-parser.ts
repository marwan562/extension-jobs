import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawJob } from '../../shared/src/domain.ts';
import { WuzzufToolError } from '../../shared/src/wuzzuf.ts';

const WUZZUF_HOSTS = new Set(['wuzzuf.net', 'www.wuzzuf.net']);

export function normalizeWuzzufUrl(value: string, base = 'https://wuzzuf.net'): string {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new WuzzufToolError('WUZZUF_INVALID_URL', 'Invalid Wuzzuf URL'); }
  const baseUrl = new URL(base);
  const isLoopbackFixture = baseUrl.hostname === '127.0.0.1' && url.hostname === '127.0.0.1' && url.port === baseUrl.port;
  if (!WUZZUF_HOSTS.has(url.hostname.toLowerCase()) && !isLoopbackFixture) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_URL', 'Only supported Wuzzuf URLs are allowed');
  url.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].forEach((key) => url.searchParams.delete(key));
  if (WUZZUF_HOSTS.has(url.hostname.toLowerCase())) { url.protocol = 'https:'; url.hostname = 'wuzzuf.net'; url.port = ''; }
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return url.href;
}

export function sourceIdFromWuzzufUrl(value: string, base?: string): string {
  const url = new URL(normalizeWuzzufUrl(value, base));
  return url.pathname.match(/\/(?:jobs\/p|internship)\/([^/?]+)/i)?.[1] ?? url.searchParams.get('id') ?? url.pathname.split('/').filter(Boolean).at(-1) ?? 'unknown';
}

export function parseWuzzufSearchHtml(html: string, base = 'https://wuzzuf.net', discoveredAt = new Date().toISOString()): RawJob[] {
  assertUsableLayout(html);
  const $ = load(html);
  $('style, script').remove();
  const cards = $('[data-testid="job-card"], article, div.css-pkv5jc').filter((_, element) => $(element).find('a[href*="/jobs/p/"], a[href*="/internship/"]').length > 0);
  const jobs: RawJob[] = [];
  cards.each((_, element) => {
    const card = $(element); const link = card.find('h2 a[href], a[data-testid="job-title"], a[href*="/jobs/p/"], a[href*="/internship/"]').first();
    const href = link.attr('href'); const title = cleanText(link.text()); if (!href || !title) return;
    const url = normalizeWuzzufUrl(href, base);
    const employer = cleanText(firstText($, card, ['[data-testid="company-name"]', 'a[href*="/company/"]', '.css-ipsyv7'])) || 'Confidential';
    const location = cleanText(firstText($, card, ['[data-testid="job-location"]', '[itemprop="jobLocation"]', '.css-16x61xq'])) || 'Egypt';
    const snippet = cleanText(firstText($, card, ['[data-testid="job-snippet"]', 'p', '.job-snippet'])) || `${title} at ${employer}`;
    const skills = unique(card.find('[data-testid="skill"], [data-testid="job-skills"] li, a[href*="/a/"]').map((__, node) => cleanText($(node).text())).get().filter(Boolean));
    const text = cleanText(card.text()).toLowerCase();
    jobs.push({ source: 'wuzzuf', sourceId: sourceIdFromWuzzufUrl(url, base), url, title, employer, location, description: snippet, requiredSkills: skills, remote: /\bremote\b|work from home/.test(text), seniority: inferExperience(text), experienceLevel: inferExperience(text), employmentType: inferEmployment(text), discoveredAt });
  });
  if (!jobs.length && /no jobs (?:found|match)|couldn't find any jobs|0 jobs found/i.test(cleanText($.root().text()))) return [];
  if (!jobs.length) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_LAYOUT', 'Wuzzuf search layout is unsupported or contains no job cards', { retryable: true });
  return jobs;
}

export function parseWuzzufJobHtml(html: string, urlValue: string, base = 'https://wuzzuf.net', discoveredAt = new Date().toISOString()): RawJob {
  assertUsableLayout(html); const $ = load(html); $('style, script').remove(); const url = normalizeWuzzufUrl(urlValue, base);
  const title = cleanText(firstPageText($, ['h1[data-testid="job-title"]', 'main h1', 'h1']));
  const employer = cleanText(firstPageText($, ['[data-testid="company-name"]', '[itemprop="hiringOrganization"]', 'a[href*="/company/"]']));
  const location = cleanText(firstPageText($, ['[data-testid="job-location"]', '[itemprop="jobLocation"]']));
  const description = cleanText(firstPageText($, ['[data-testid="job-description"]', '[itemprop="description"]', '#job-description']));
  if (!title || !employer || !description) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_LAYOUT', 'Required job detail elements were not found', { retryable: true, diagnostics: { titleFound: !!title, employerFound: !!employer, descriptionFound: !!description } });
  const requirements = listFrom($, ['[data-testid="job-requirements"]', '#job-requirements']);
  const responsibilities = listFrom($, ['[data-testid="job-responsibilities"]', '#job-responsibilities']);
  const skills = unique($('[data-testid="job-skills"] li, [data-testid="skill"], a[href*="/a/"]').map((_, node) => cleanText($(node).text())).get().filter(Boolean));
  const pageText = cleanText($.root().text());
  return { source: 'wuzzuf', sourceId: sourceIdFromWuzzufUrl(url, base), url, title, employer, location: location || 'Egypt', description, requirements, responsibilities, requiredSkills: skills, remote: /\bremote\b|work from home/i.test(pageText), seniority: inferExperience(pageText), experienceLevel: cleanText(firstPageText($, ['[data-testid="experience-level"]'])) || inferExperience(pageText), employmentType: cleanText(firstPageText($, ['[data-testid="employment-type"]'])) || inferEmployment(pageText), applicationAvailable: $('[data-testid="apply-button"], a, button').filter((_, node) => /apply/i.test(cleanText($(node).text()))).length > 0, discoveredAt };
}

export function detectWuzzufPageState(html: string): 'ok' | 'login_required' | 'challenge' {
  const text = cleanText(load(html).root().text());
  if (/captcha|verify you are human|performing security verification|security service to protect against malicious bots|unusual traffic|security check/i.test(text)) return 'challenge';
  if (/login required|sign in to apply/i.test(text) || /type=["']password["']/i.test(html)) return 'login_required';
  return 'ok';
}

function assertUsableLayout(html: string): void { const state = detectWuzzufPageState(html); if (state === 'challenge') throw new WuzzufToolError('WUZZUF_CHALLENGE_REQUIRED', 'Wuzzuf requires manual challenge completion', { status: 409 }); if (state === 'login_required') throw new WuzzufToolError('WUZZUF_LOGIN_REQUIRED', 'Wuzzuf login is required', { status: 401 }); }
function cleanText(value: string): string { return value.replace(/<!--.*?-->/gs, ' ').replace(/\s+/g, ' ').trim(); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function firstText($: CheerioAPI, root: Cheerio<AnyNode>, selectors: string[]): string { for (const selector of selectors) { const value = root.find(selector).first().text(); if (value) return value; } return ''; }
function firstPageText($: CheerioAPI, selectors: string[]): string { for (const selector of selectors) { const value = $(selector).first().text(); if (value) return value; } return ''; }
function listFrom($: CheerioAPI, selectors: string[]): string[] { for (const selector of selectors) { const root = $(selector).first(); if (!root.length) continue; const items = root.find('li').map((_, node) => cleanText($(node).text())).get().filter(Boolean); return items.length ? unique(items) : [cleanText(root.text())].filter(Boolean); } return []; }
function inferExperience(text: string): string { const match = text.match(/\b(intern(?:ship)?|entry level|junior|mid(?:-level)?|senior|manager|lead)\b/i); return match?.[1]?.toLowerCase() ?? 'unspecified'; }
function inferEmployment(text: string): string { const match = text.match(/\b(full[- ]time|part[- ]time|contract|freelance|internship|temporary)\b/i); return match?.[1]?.toLowerCase().replace(' ', '-') ?? 'unspecified'; }
