'use client';

import { Button } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface LogoutButtonProps {
  className?: string;
  size?: 'small' | 'middle' | 'large';
  type?: 'default' | 'primary' | 'text' | 'link';
  block?: boolean;
}

/**
 * Logout button component
 * Uses auth context to logout and redirect to CRM login
 */
export function LogoutButton({ 
  className, 
  size = 'middle',
  type = 'default',
  block = false,
}: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { logout } = useAuth();

  const handleLogout = async () => {
    setIsLoading(true);
    await logout();
    // Note: logout() handles the redirect, so we don't need to do anything else
  };

  return (
    <Button
      type={type}
      size={size}
      icon={<LogoutOutlined />}
      onClick={handleLogout}
      loading={isLoading}
      className={className}
      block={block}
    >
      Logout
    </Button>
  );
}
