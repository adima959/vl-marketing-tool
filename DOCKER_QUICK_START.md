# Docker Quick Start Guide

## What Changed

The Dockerfile has been **optimized** for Next.js 16 with Turbopack. It uses a traditional Docker deployment approach that is reliable and well-tested.

### Key Changes:

1. **Lazy database initialization** - Database connections only created at runtime
2. **Dummy build-time env vars** - Next.js 16 validates API routes during build
3. **Multi-stage build** - Optimized layers for better caching
4. **Memory optimizations** - 4GB memory limit for Next.js build process
5. **Native module support** - Includes python3, make, g++ for mysql2 and other native modules

## File Structure in Container:

```
/app/
├── node_modules/     (production dependencies)
├── .next/            (built Next.js application)
├── public/           (static files)
├── package.json      (dependencies list)
└── next.config.js    (Next.js configuration)
```

## Deploy to Portainer

### Step 1: Create Stack

1. Open Portainer
2. Go to **Stacks** → **Add Stack**
3. Name: `vitaliv-marketing-tool`
4. Choose **Repository** or **Web editor**

### Step 2: Set Environment Variables

Add these in Portainer's **Environment variables** section:

```env
# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# MariaDB
MARIADB_HOST=your-mariadb-host
MARIADB_USER=your-user
MARIADB_PASSWORD=your-password
MARIADB_DATABASE=your-database
MARIADB_PORT=3306

# CRM URLs (optional - defaults provided)
CRM_BASE_URL=https://vitaliv.no/admin
CRM_LOGIN_URL=https://vitaliv.no/admin/site/marketing
CRM_VALIDATE_ENDPOINT=/site/marketing

# Auth Settings (optional - defaults provided)
AUTH_COOKIE_NAME=crm_auth_token
AUTH_COOKIE_MAX_AGE=86400

# API Keys (REQUIRED)
SESSION_WIPE_API_KEY=your-session-wipe-key
USER_MANAGEMENT_API_KEY=your-user-management-key

# Public URLs (optional - defaults provided)
NEXT_PUBLIC_CRM_LOGIN_URL=https://vitaliv.no/admin/site/marketing
NEXT_PUBLIC_CRM_LOGOUT_URL=https://vitaliv.no/admin
```

### Step 3: Deploy

Click **Deploy the stack** and wait for the build to complete (3-5 minutes).

### Step 4: Verify

Check health endpoint:
```bash
curl http://your-server:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-25T...",
  "uptime": 123.45,
  "environment": "production"
}
```

## Local Docker Build (Optional)

Test the build locally before deploying to Portainer:

```bash
# Build the image
docker-compose build

# Run the container
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop
docker-compose down
```

## Troubleshooting

### Build Takes Too Long

- First build will take 3-5 minutes (downloading dependencies)
- Subsequent builds are faster (cached layers)

### Build Fails with "npm run build" Error

If you see `exit code: 1` during build in Portainer:

**Memory Issue**: Next.js builds require significant memory (2-4GB). The Dockerfile is configured with 4GB memory limit, but Portainer might have build resource limits.

**Solutions**:
1. Check Portainer settings → Increase build memory limits
2. Build locally and push to registry:
   ```bash
   docker build -t your-registry/vitaliv-marketing-tool:latest .
   docker push your-registry/vitaliv-marketing-tool:latest
   ```
   Then update docker-compose.yaml to use the pre-built image
3. Use a build server with more resources

### Container Won't Start

Check logs:
```bash
docker logs vitaliv-marketing-tool
```

Common issues:
- Missing environment variables
- Database connection failed
- Port 3000 already in use

### Health Check Failing

Increase start period in docker-compose.yaml:
```yaml
healthcheck:
  start_period: 60s  # Give app more time to start
```

## Image Size

The final image is approximately:
- **~500MB** (includes Node.js 20, dependencies, and built app)
- Larger than standalone mode but more reliable
- Optimized with multi-stage build

## Performance

- Same performance as local Next.js app
- Memory usage: ~200-500MB
- CPU usage: Minimal when idle
- Starts in: ~5-10 seconds

## Security

✅ Runs as non-root user (`nextjs`)
✅ HTTP-only cookies
✅ Environment variables for secrets
✅ Production-optimized build
✅ Health checks enabled

## Support

For issues:
1. Check TROUBLESHOOTING.md
2. Review container logs
3. Verify environment variables
4. Test health endpoint

## Related Documentation

- [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) - Full deployment guide
- [PORTAINER_DEPLOYMENT.md](PORTAINER_DEPLOYMENT.md) - Portainer-specific guide
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and fixes
