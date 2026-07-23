import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { AuthBoundary } from './Auth';

test('login exchanges the pairing code without rendering a bearer token', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'Dashboard authentication required', correlationId: 'one' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { authenticated: true, csrfToken: 'x'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() }, correlationId: 'two' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  render(<AuthBoundary><p>Private workspace</p></AuthBoundary>);
  expect(await screen.findByRole('heading', { name: /job search stays/i })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Pairing code'), 'one-time-code');
  await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }));
  await waitFor(() => expect(screen.getByText('Private workspace')).toBeInTheDocument());
  expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty('headers', expect.objectContaining({ authorization: expect.anything() }));
  fetchMock.mockRestore();
});
