import Link from 'next/link';
import { Result, Button } from 'antd';
import { colors } from '@/styles/tokens';

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.background.secondary,
        padding: 24,
      }}
    >
      <Result
        status="404"
        title="404"
        subTitle="Sorry, the page you visited does not exist."
        extra={
          <Link href="/">
            <Button type="primary">Back to Dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
