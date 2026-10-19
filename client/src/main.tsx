import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import './style.css';

const queryClient = new QueryClient();

function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/health', { signal });
      if (!response.ok) throw new Error('API or database unavailable. Check the server terminal.');
      return true;
    },
    retry: false,
  });

  return (
    <main>
      <p>Phase 1 · Project setup</p>
      <h1>Orders Console</h1>
      <p>React is running.</p>
      <p role="status">
        {health.isPending ? 'Checking API and database…' : health.isError ? health.error.message : 'API and MongoDB are connected.'}
      </p>
      <button onClick={() => void health.refetch()} disabled={health.isFetching}>
        {health.isFetching ? 'Checking…' : 'Check connection'}
      </button>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
  </StrictMode>,
);
