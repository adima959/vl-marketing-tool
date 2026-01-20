import { Layout, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Header, Content } = Layout;
const { Title } = Typography;

interface ReportLayoutProps {
  children: ReactNode;
}

export function ReportLayout({ children }: ReportLayoutProps) {
  return (
    <Layout style={{ height: '100vh', background: '#f5f5f5' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          borderBottom: '1px solid #e0e0e0',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          alignItems: 'center',
          height: 56,
          flexShrink: 0,
        }}
      >
        <Title level={4} style={{ margin: 0, fontWeight: 600, color: '#262626' }}>
          Analytics Dashboard
        </Title>
      </Header>
      <Content
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {children}
      </Content>
    </Layout>
  );
}
