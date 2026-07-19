import { parseWuzzufSearchHtml } from './packages/site-adapters/src/wuzzuf-parser.ts';
import * as fs from 'fs';

const html = fs.readFileSync('/Users/marwanhassan/.openclaw/workspace/wuzzuf.html', 'utf8');
try {
  const jobs = parseWuzzufSearchHtml(html);
  console.log('Parsed jobs count:', jobs.length);
  console.log('First job:', JSON.stringify(jobs[0], null, 2));
} catch (err) {
  console.error('Error parsing:', err);
}
