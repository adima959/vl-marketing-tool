import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { withAdmin, getUserByExternalId, getUserByEmail } from '@/lib/rbac';
import { UserRole, type CreateUserDTO } from '@/types/user';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_MANAGEMENT_API_KEY = process.env.USER_MANAGEMENT_API_KEY || '';

/**
 * GET /api/users
 * Lists all users (admin only)
 */
export const GET = withAdmin(async (request, user) => {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT id, external_id, name, email, role, created_at, updated_at
       FROM app_users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );
    
    return NextResponse.json({
      success: true,
      users: result.rows,
    });
  } catch (error) {
    console.error('[API /users GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

/**
 * POST /api/users
 * Creates a new user (API key protected)
 * Automatically generates UUID v4 for id field
 * 
 * Usage from another server:
 * curl -X POST https://yourapp.com/api/users \
 *   -H "X-API-Key: your-secret-key" \
 *   -H "Content-Type: application/json" \
 *   -d '{"external_id":"123","name":"John Doe","email":"john@example.com","role":"user"}'
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check for API key
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing X-API-Key header' },
      { status: 401 }
    );
  }

  if (!USER_MANAGEMENT_API_KEY) {
    console.error('USER_MANAGEMENT_API_KEY not configured in environment');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (apiKey !== USER_MANAGEMENT_API_KEY) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  // Parse request body
  let body: CreateUserDTO;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.external_id || !body.name || !body.email) {
    return NextResponse.json(
      { error: 'Missing required fields: external_id, name, email' },
      { status: 400 }
    );
  }

  // Validate role if provided
  if (body.role && !Object.values(UserRole).includes(body.role)) {
    return NextResponse.json(
      { error: 'Invalid role. Must be "user" or "admin"' },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    // Check if user already exists by external_id or email
    const existingByExternalId = await getUserByExternalId(body.external_id);
    if (existingByExternalId) {
      return NextResponse.json(
        { error: 'User with this external_id already exists' },
        { status: 409 }
      );
    }

    const existingByEmail = await getUserByEmail(body.email);
    if (existingByEmail) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Generate UUID v4 for id
    const userId = randomUUID();

    // Create user
    const result = await client.query(
      `INSERT INTO app_users (id, external_id, name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, external_id, name, email, role, created_at`,
      [userId, body.external_id, body.name, body.email, body.role || UserRole.USER]
    );

    return NextResponse.json({
      success: true,
      user: result.rows[0],
    }, { status: 201 });
  } catch (error) {
    console.error('[API /users POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
