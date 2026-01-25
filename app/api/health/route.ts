import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Docker/Kubernetes health monitoring
 * Returns 200 OK if the application is running
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
}
