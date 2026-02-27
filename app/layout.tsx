import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './providers';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Manor -- Command Centre',
  description: 'AI Agent Management Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div
            className="flex h-screen overflow-hidden"
            style={{ background: 'var(--bg)' }}
          >
            {/* Client-side shell handles both desktop sidebar + mobile */}
            <Sidebar />

            {/* Main content */}
            <main className="flex-1 overflow-hidden relative">
              {/* Mobile spacer for fixed header */}
              <div className="md:hidden" style={{ height: '48px', flexShrink: 0 }} />
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
