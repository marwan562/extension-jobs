import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthBoundary } from './app/Auth';
import App from './app/App';
import './styles.css';

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter basename="/dashboard">
        <AuthBoundary><App /></AuthBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
