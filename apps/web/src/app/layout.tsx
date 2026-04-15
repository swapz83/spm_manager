'use client';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { FiltersProvider } from '@/lib/filters';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: false } },
  }));

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <QueryClientProvider client={queryClient}>
          <FiltersProvider>
            {children}
          </FiltersProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
