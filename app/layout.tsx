import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import theme from '@/theme/themeConfig';
import { ToastContainer } from '@/components/notifications/Toast';
import { KeyboardShortcuts } from '@/components/accessibility/KeyboardShortcuts';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analytics Dashboard',
  description: 'Marketing analytics reporting',
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
            {children}
            <ToastContainer />
            <KeyboardShortcuts />
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
