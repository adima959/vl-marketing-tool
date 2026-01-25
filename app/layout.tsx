import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import theme from '@/styles/theme';
import { ToastContainer } from '@/components/notifications/Toast';
import { KeyboardShortcuts } from '@/components/accessibility/KeyboardShortcuts';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/auth/RouteGuard';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vitaliv Analytics',
  description: 'Marketing analytics and reporting platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AntdRegistry>
          <ConfigProvider theme={theme}>
            <AuthProvider>
              <RouteGuard>
                <SidebarProvider>
                  <AppSidebar />
                  <SidebarInset className="flex flex-col overflow-hidden">
                    {children}
                  </SidebarInset>
                </SidebarProvider>
                <ToastContainer />
                <KeyboardShortcuts />
              </RouteGuard>
            </AuthProvider>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
