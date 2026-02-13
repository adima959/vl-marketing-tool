// Root layout — app shell with auth, sidebar, and providers
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, App, Spin } from 'antd';
import theme from '@/styles/theme';
import { ToastContainer } from '@/components/notifications/Toast';
import { KeyboardShortcuts } from '@/components/accessibility/KeyboardShortcuts';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/auth/RouteGuard';
import { ActiveTimeTracker } from '@/components/ActiveTimeTracker';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';
import type { Metadata } from 'next';

// Font optimization with next/font
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Vitaliv Analytics',
  description: 'Marketing analytics and reporting platform',
};

// Loading fallback for Suspense boundary
function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      width: '100vw'
    }}>
      <Spin size="large">
        <div style={{ padding: '50px' }} />
      </Spin>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body suppressHydrationWarning>
        <AntdRegistry>
          <ConfigProvider theme={theme}>
            <App>
            <AuthProvider>
              <Suspense fallback={<LoadingFallback />}>
                <RouteGuard>
                  <ActiveTimeTracker>
                  <NuqsAdapter>
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex flex-col overflow-hidden isolate">
                        {children}
                      </SidebarInset>
                    </SidebarProvider>
                    <ToastContainer />
                    <KeyboardShortcuts />
                  </NuqsAdapter>
                </ActiveTimeTracker>
                </RouteGuard>
              </Suspense>
            </AuthProvider>
            </App>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
