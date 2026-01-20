import { Layout, Typography } from 'antd';
import type { ReactNode } from 'react';
import styles from './ReportLayout.module.css';

const { Header, Content } = Layout;
const { Title } = Typography;

interface ReportLayoutProps {
  children: ReactNode;
}

export function ReportLayout({ children }: ReportLayoutProps) {
  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <Title level={4} className={styles.title}>
          Analytics Dashboard
        </Title>
      </Header>
      <Content className={styles.content}>
        {children}
      </Content>
    </Layout>
  );
}
