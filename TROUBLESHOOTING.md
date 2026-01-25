# Troubleshooting Guide

## Common Docker Build Issues

### Error: `/app/.next/standalone not found`

This error occurs when Next.js standalone build doesn't create the expected directory. Here are the fixes I've applied:

**Changes Made:**

1. **Updated Dockerfile**:
   - Changed `npm ci` to `npm install` for better compatibility
   - Added debugging output after build to show directory contents
   - Simplified build args (only NEXT_PUBLIC_ variables needed at build time)
   - Updated health check to use `wget` instead of Node.js
   - Set correct file ownership during copy operations

2. **Updated docker-compose.yaml**:
   - Removed unnecessary build arguments
   - Updated health check command
   - Simplified environment variable passing

3. **Verified next.config.ts**:
   - Contains `output: 'standalone'` configuration
   - This is required for Docker builds

**Testing the Build:**

After these changes, the build will show debug output like:
```
Build completed. Listing .next directory:
drwxr-xr-x    5 root     root          4096 Jan 25 12:00 .
drwxr-xr-x   10 root     root          4096 Jan 25 12:00 ..
drwxr-xr-x    3 root     root          4096 Jan 25 12:00 cache
drwxr-xr-x    5 root     root          4096 Jan 25 12:00 server
drwxr-xr-x    3 root     root          4096 Jan 25 12:00 standalone
drwxr-xr-x    3 root     root          4096 Jan 25 12:00 static
```

If you see `standalone` directory listed, the build is successful.

**If the error persists:**

1. **Check for build errors**:
   ```bash
   docker-compose build --no-cache
   ```
   Look for TypeScript errors or missing dependencies in the build output.

2. **Verify package.json has build script**:
   ```json
   {
     "scripts": {
       "build": "next build"
     }
   }
   ```

3. **Check next.config.ts**:
   ```typescript
   const nextConfig: NextConfig = {
     output: 'standalone',  // Must be present
   };
   ```

4. **Manual build test locally**:
   ```bash
   npm install
   npm run build
   ls -la .next/standalone/
   ```

5. **Check Portainer build logs**:
   - Go to Portainer → Stacks → Your Stack
   - Check the build output for errors
   - Look for the debug output showing directory contents

---

## Portainer-Specific Issues

### Build Fails in Portainer but Works Locally

**Possible causes:**

1. **Different Node versions**
   - Portainer uses the Dockerfile's Node version (20-alpine)
   - Local might be different

2. **Environment variables not set**
   - NEXT_PUBLIC_ variables must be set as build args or in Portainer env vars

3. **Network access during build**
   - Portainer container needs internet access to download dependencies

**Solution:**
- Use `docker-compose.portainer.yaml` specifically for Portainer
- Set all environment variables in Portainer UI
- Check Portainer container logs

### Health Check Keeps Failing

**Symptoms:** Container shows as unhealthy in Portainer

**Fixes:**

1. **Check if app is actually running**:
   ```bash
   docker exec vitaliv-marketing-tool wget -O- http://localhost:3000/api/health
   ```

2. **Increase start_period**:
   ```yaml
   healthcheck:
     start_period: 60s  # Increase if app takes longer to start
   ```

3. **Check logs**:
   ```bash
   docker logs vitaliv-marketing-tool
   ```

---

## Database Connection Issues

### Can't Connect to Neon PostgreSQL

**Check:**
1. Connection string format: `postgresql://user:pass@host/db?sslmode=require`
2. Network access from Docker container to external database
3. Firewall rules allow outbound connections

**Test:**
```bash
docker exec vitaliv-marketing-tool ping your-db-host.neon.tech
```

### Can't Connect to MariaDB

**Check:**
1. All MARIADB_* environment variables are set
2. Port 3306 is accessible
3. User has remote access permissions

**Test:**
```bash
docker exec vitaliv-marketing-tool nc -zv mariadb-host 3306
```

---

## Memory Issues

### Container OOM (Out of Memory)

**Symptoms:** Container crashes with exit code 137

**Solution:**
Increase memory limit in docker-compose.yaml:
```yaml
deploy:
  resources:
    limits:
      memory: 2G  # Increase from 1G
```

---

## Port Conflicts

### Port 3000 Already in Use

**Check what's using the port:**
```bash
netstat -tulpn | grep 3000
# or
lsof -i :3000
```

**Solutions:**
1. Stop the conflicting service
2. Change port in docker-compose.yaml:
   ```yaml
   ports:
     - "3001:3000"  # Map to different external port
   ```

---

## Build Cache Issues

### Changes Not Reflected in Build

**Solution:** Clear Docker build cache
```bash
docker-compose build --no-cache
```

Or in Portainer:
- Delete the stack
- Recreate it
- Check "Force pull" option

---

## Permission Issues

### EACCES Errors During Build

**Cause:** Files owned by root or wrong user

**Solution:**
The Dockerfile now uses `--chown=nextjs:nodejs` during COPY operations.

If issues persist:
```dockerfile
# In Dockerfile, after COPY
RUN chown -R nextjs:nodejs /app
```

---

## Verification Steps

After deployment, verify everything works:

1. **Container is running:**
   ```bash
   docker ps | grep vitaliv-marketing-tool
   ```

2. **Health check passes:**
   ```bash
   curl http://localhost:3000/api/health
   ```
   Should return:
   ```json
   {
     "status": "ok",
     "timestamp": "...",
     "uptime": 123.45,
     "environment": "production"
   }
   ```

3. **Application loads:**
   - Open browser to `http://your-server:3000`
   - Should redirect to CRM login if not authenticated

4. **Database connections work:**
   - Check logs for successful connections
   - No database errors on startup

---

## Getting Help

If you're still experiencing issues:

1. **Collect information:**
   ```bash
   # Build output
   docker-compose build 2>&1 | tee build.log

   # Runtime logs
   docker logs vitaliv-marketing-tool &> runtime.log

   # Container inspect
   docker inspect vitaliv-marketing-tool > inspect.json
   ```

2. **Check Next.js documentation:**
   - [Standalone Output](https://nextjs.org/docs/advanced-features/output-file-tracing)
   - [Docker Deployment](https://nextjs.org/docs/deployment#docker-image)

3. **Review this project's docs:**
   - DOCKER_DEPLOYMENT.md
   - PORTAINER_DEPLOYMENT.md
