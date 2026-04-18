'use client';
import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { FiltersProvider } from '@/lib/filters';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: false } },
  }));

  return (
    <html lang="en" className={font.className}>
      <body className="min-h-screen" style={{ background: 'var(--surface)' }}>
        <QueryClientProvider client={queryClient}>
          <FiltersProvider>
            {children}
          </FiltersProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
