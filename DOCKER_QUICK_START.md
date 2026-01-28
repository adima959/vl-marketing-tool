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

## Local Docker Build

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

If you see `exit code: 1` during build:

**Memory Issue**: Next.js builds require significant memory (2-4GB). The Dockerfile is configured with 4GB memory limit.

**Solutions**:
1. Build locally and push to registry:
   ```bash
   docker build -t your-registry/vitaliv-marketing-tool:latest .
   docker push your-registry/vitaliv-marketing-tool:latest
   ```
   Then update docker-compose.yaml to use the pre-built image
2. Use a build server with more resources

### Container Won't Start

Check logs:
```bash
docker logs vitaliv-marketing-tool
```

Common issues:
- Missing environment variables
- Database connection failed
- Port 3991 already in use

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
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and fixes
