export const wuzzufSelectors = {
  searchCards: [
    '[data-testid="job-card"]',
    'article:has(a[href*="/jobs/p/"])',
    'div:has(> h2 a[href*="/jobs/p/"])'
  ],
  jobTitle: ['h1[data-testid="job-title"]', 'main h1', 'h1'],
  employer: ['[data-testid="company-name"]', 'a[href*="/company/"]', '[itemprop="hiringOrganization"]'],
  location: ['[data-testid="job-location"]', '[itemprop="jobLocation"]', 'span:has-text("Egypt")'],
  description: ['[data-testid="job-description"]', '[itemprop="description"]', 'section:has(h2:text-is("Job Description"))'],
  requirements: ['[data-testid="job-requirements"]', 'section:has(h2:text-is("Job Requirements"))'],
  responsibilities: ['[data-testid="job-responsibilities"]', 'section:has(h2:text-is("Responsibilities"))'],
  skills: ['[data-testid="job-skills"] a', '[data-testid="job-skills"] li', 'a[href*="/a/"]'],
  applyButton: [
    'button:has-text("Apply for Job")',
    'a:has-text("Apply for Job")',
    'button:has-text("Complete your application")',
    'a:has-text("Complete your application")',
    'button:has-text("Complete application")',
    'a:has-text("Complete application")',
    'button:has-text("Apply Now")',
    'a:has-text("Apply Now")',
    'button:has-text("Apply")',
    '[data-testid="apply-button"]'
  ],
  loginMarker: ['a:has-text("Login")', 'form[action*="login"]', 'input[type="password"]', 'button:has-text("Sign in")', 'a:has-text("Sign in")', 'a[href*="/login"]'],
  authenticatedMarker: ['a[href*="/me/"]', '[data-testid="user-menu"]', 'a:has-text("My Applications")', 'a[href*="/applications"]', 'a:has-text("Applications")'],
  challengeMarker: ['iframe[src*="captcha"]', '[class*="captcha"]', 'text=/verify you are human|unusual traffic|security check/i'],
  form: [
    'form[aria-label*="application" i]',
    'form:has(button:has-text("Submit"))',
    'form[action="#"]',
    'form:not([action*="search"])'
  ],
  submitButton: [
    'button:has-text("Submit application")',
    'button:has-text("Submit Application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'form[action="#"] button[type="submit"]',
    'button[type="submit"]:not(form[role="search"] button)'
  ]
} as const;
