import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, getAuthToken, removeSessionFromWhitelist } from '@/lib/auth';

/**
 * Logout route handler
 * Clears the authentication cookie and removes session from whitelist
 * The client should then redirect to the CRM base URL
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Get the token before clearing it
  const token = getAuthToken(request);

  // Create response
  const response = NextResponse.json({ success: true });

  // Clear auth cookie
  clearAuthCookie(response);

  // Remove session from whitelist
  if (token) {
    removeSessionFromWhitelist(token);
  }

  return response;
}

/**
 * Allow GET for simple logout links
 * Redirects to CRM base URL (not login page) to prevent auto-login
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const crmBaseUrl = process.env.CRM_BASE_URL || 'https://vitaliv.no/admin';
  
  // Get the token before clearing it
  const token = getAuthToken(request);

  // Create redirect response to CRM base URL
  const response = NextResponse.redirect(crmBaseUrl);

  // Clear auth cookie
  clearAuthCookie(response);

  // Remove session from whitelist
  if (token) {
    removeSessionFromWhitelist(token);
  }

  return response;
}
