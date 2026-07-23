import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { expect, test } from 'vitest';
import { EmptyState, PageHeader, ScoreRing, StatusBadge } from './UI';

test('score and status expose readable text without relying on color', () => {
  render(<><ScoreRing score={84} /><StatusBadge value="AWAITING_SUBMISSION_APPROVAL" /></>);
  expect(screen.getByLabelText('84 percent match')).toBeInTheDocument();
  expect(screen.getByText('awaiting submission approval')).toBeInTheDocument();
});

test('common page primitives have no axe violations', async () => {
  const { container } = render(<main><PageHeader eyebrow="LOCAL" title="Jobs" description="Private job operations." /><EmptyState title="No jobs" description="Run a campaign." /></main>);
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations).toEqual([]);
});
