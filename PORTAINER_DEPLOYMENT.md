# Portainer Deployment Guide

This guide explains how to deploy the Vitaliv Marketing Tool using Portainer.

## Method 1: Deploy from Git Repository (Recommended)

### Step 1: Add Stack in Portainer

1. Log in to Portainer
2. Go to **Stacks** → **Add Stack**
3. Name your stack: `vitaliv-marketing-tool`
4. Choose **Repository** as the build method

### Step 2: Configure Repository

- **Repository URL**: Your Git repository URL
- **Repository reference**: `refs/heads/main` (or your branch)
- **Compose path**: `docker-compose.portainer.yaml`

### Step 3: Set Environment Variables

In the **Environment variables** section, add the following:

**Required Variables:**
```
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
MARIADB_HOST=your-mariadb-host
MARIADB_USER=your-mariadb-user
MARIADB_PASSWORD=your-mariadb-password
MARIADB_DATABASE=your-mariadb-database
MARIADB_PORT=3306
SESSION_WIPE_API_KEY=your-secure-session-wipe-key
USER_MANAGEMENT_API_KEY=your-secure-user-management-key
```

**Pre-configured Variables (optional to override):**
```
NODE_ENV=production
CRM_BASE_URL=https://vitaliv.no/admin
CRM_LOGIN_URL=https://vitaliv.no/admin/site/marketing
CRM_VALIDATE_ENDPOINT=/site/marketing
AUTH_COOKIE_NAME=crm_auth_token
AUTH_COOKIE_MAX_AGE=86400
NEXT_PUBLIC_CRM_LOGIN_URL=https://vitaliv.no/admin/site/marketing
NEXT_PUBLIC_CRM_LOGOUT_URL=https://vitaliv.no/admin
```

### Step 4: Deploy

Click **Deploy the stack** and wait for the build to complete.

---

## Method 2: Deploy with Web Editor

### Step 1: Add Stack in Portainer

1. Log in to Portainer
2. Go to **Stacks** → **Add Stack**
3. Name your stack: `vitaliv-marketing-tool`
4. Choose **Web editor**

### Step 2: Paste Docker Compose

Copy and paste the following docker-compose configuration:

```yaml
version: '3.8'

services:
  vitaliv-marketing-tool:
    image: node:20-alpine
    container_name: vitaliv-marketing-tool

    working_dir: /app

    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - MARIADB_HOST=${MARIADB_HOST}
      - MARIADB_USER=${MARIADB_USER}
      - MARIADB_PASSWORD=${MARIADB_PASSWORD}
      - MARIADB_DATABASE=${MARIADB_DATABASE}
      - MARIADB_PORT=${MARIADB_PORT:-3306}
      - CRM_BASE_URL=${CRM_BASE_URL:-https://vitaliv.no/admin}
      - CRM_LOGIN_URL=${CRM_LOGIN_URL:-https://vitaliv.no/admin/site/marketing}
      - CRM_VALIDATE_ENDPOINT=${CRM_VALIDATE_ENDPOINT:-/site/marketing}
      - AUTH_COOKIE_NAME=${AUTH_COOKIE_NAME:-crm_auth_token}
      - AUTH_COOKIE_MAX_AGE=${AUTH_COOKIE_MAX_AGE:-86400}
      - SESSION_WIPE_API_KEY=${SESSION_WIPE_API_KEY}
      - USER_MANAGEMENT_API_KEY=${USER_MANAGEMENT_API_KEY}
      - NEXT_PUBLIC_CRM_LOGIN_URL=${NEXT_PUBLIC_CRM_LOGIN_URL:-https://vitaliv.no/admin/site/marketing}
      - NEXT_PUBLIC_CRM_LOGOUT_URL=${NEXT_PUBLIC_CRM_LOGOUT_URL:-https://vitaliv.no/admin}

    ports:
      - "3000:3991"

    restart: unless-stopped

    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3991/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Step 3: Set Environment Variables

Add your environment variables in the **Environment variables** section (same as Method 1).

### Step 4: Deploy

Click **Deploy the stack**.

---

## Method 3: Upload Pre-built Image

### Step 1: Build Image Locally

On your local machine or build server:

```bash
# Build the image
docker build -t vitaliv-marketing-tool:latest .

# Tag for your registry
docker tag vitaliv-marketing-tool:latest your-registry/vitaliv-marketing-tool:latest

# Push to registry
docker push your-registry/vitaliv-marketing-tool:latest
```

### Step 2: Deploy in Portainer

1. Go to **Stacks** → **Add Stack**
2. Name: `vitaliv-marketing-tool`
3. Use this simple compose file:

```yaml
version: '3.8'

services:
  vitaliv-marketing-tool:
    image: your-registry/vitaliv-marketing-tool:latest
    container_name: vitaliv-marketing-tool

    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      # ... add all other environment variables

    ports:
      - "3000:3991"

    restart: unless-stopped
```

---

## Setting Environment Variables in Portainer

There are three ways to set environment variables in Portainer:

### Option 1: Stack Environment Variables (Recommended)

When creating/editing a stack:
1. Scroll to **Environment variables** section
2. Click **Add environment variable**
3. Enter `Name` and `Value`
4. Repeat for all variables

### Option 2: Advanced Mode

Toggle **Show advanced options** and add in the format:
```
DATABASE_URL=postgresql://...
MARIADB_HOST=your-host
```

### Option 3: In Compose File

Directly in the YAML:
```yaml
environment:
  - DATABASE_URL=postgresql://user:password@host/database
  - MARIADB_HOST=mariadb.example.com
```

**Security Note**: For production, use Portainer's environment variables feature instead of hardcoding secrets in the compose file.

---

## Verifying Deployment

### Check Container Status

1. Go to **Containers** in Portainer
2. Find `vitaliv-marketing-tool`
3. Status should be **Running** with a green dot

### Check Logs

1. Click on the container name
2. Go to **Logs** tab
3. Look for `Ready in XXXms` message

### Test Health Endpoint

From Portainer Console or your browser:
```bash
curl http://your-server:3991/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-25T...",
  "uptime": 123.456,
  "environment": "production"
}
```

---

## Updating the Application

### Update from Git (Method 1)

1. Go to **Stacks** → `vitaliv-marketing-tool`
2. Click **Pull and redeploy**
3. Portainer will pull latest code and rebuild

### Manual Update

1. Build new image (locally or CI/CD)
2. Push to registry
3. In Portainer: **Stacks** → Edit → **Pull latest image** → **Update**

---

## Troubleshooting

### Container Keeps Restarting

**Check logs:**
1. Go to container → **Logs**
2. Look for error messages

**Common issues:**
- Missing environment variables
- Database connection failed
- Build errors

### Health Check Failing

1. Check if port 3000 is accessible inside container
2. Verify health endpoint works: `docker exec vitaliv-marketing-tool wget -O- http://localhost:3991/api/health`

### Build Errors in Portainer

**Error: "context" is not available**
- Make sure you selected **Repository** build method
- Provide Git repository URL
- Specify correct compose file path

**Error: "No such file or directory"**
- Ensure Dockerfile exists in repository root
- Check compose file path is correct

### Environment Variables Not Working

1. Verify variables are set in Portainer UI
2. Check container environment: `docker exec vitaliv-marketing-tool env`
3. Restart container after changing variables

---

## Resource Management

### Adjust Resource Limits

Edit stack and modify:
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'      # Increase CPU
      memory: 2G       # Increase memory
```

### Monitor Resource Usage

1. Go to **Containers** → `vitaliv-marketing-tool`
2. View **Stats** section
3. Monitor CPU, Memory, Network usage

---

## Security Best Practices

1. **Use Portainer Secrets** for sensitive variables
2. **Enable HTTPS** with reverse proxy
3. **Limit container resources** to prevent DoS
4. **Regular updates** - rebuild image periodically
5. **Network isolation** - use custom networks
6. **Read-only filesystem** if possible

---

## Support

If you encounter issues:
1. Check container logs in Portainer
2. Verify environment variables are set
3. Test health endpoint
4. Check database connectivity
5. Review deployment documentation

For additional help, consult:
- DOCKER_DEPLOYMENT.md
- Next.js documentation
- Portainer documentation
