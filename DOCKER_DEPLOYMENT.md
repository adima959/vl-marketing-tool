# Docker Deployment Guide

This guide explains how to deploy the Vitaliv Marketing Tool using Docker.

## Prerequisites

- Docker (version 20.10 or higher)
- Docker Compose (version 2.0 or higher)
- Production environment variables

## Quick Start

### 1. Prepare Environment Variables

Copy the template environment file and fill in your production values:

```bash
cp .env.production .env.production.local
```

Edit `.env.production.local` with your actual production credentials:
- Database connection strings
- CRM URLs and endpoints
- API keys
- Other sensitive configuration

### 2. Build and Run with Docker Compose

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### 3. Verify Deployment

Check if the application is running:

```bash
# Check container status
docker-compose ps

# Check health
curl http://localhost:3000/api/health
```

You should see a JSON response with `"status": "ok"`.

## Production Deployment

### Build the Image

```bash
# Build the production image
docker build -t vitaliv-marketing-tool:latest .

# Or with docker-compose
docker-compose build
```

### Run the Container

```bash
# Start with docker-compose (recommended)
docker-compose up -d

# Or run directly with docker
docker run -d \
  --name vitaliv-marketing-tool \
  --env-file .env.production.local \
  -p 3000:3000 \
  --restart unless-stopped \
  vitaliv-marketing-tool:latest
```

### Environment Variables

The application requires the following environment variables:

**Database:**
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `MARIADB_HOST`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE`, `MARIADB_PORT` - MariaDB credentials

**Authentication:**
- `CRM_BASE_URL` - Base URL of your CRM
- `CRM_LOGIN_URL` - CRM login page URL
- `CRM_VALIDATE_ENDPOINT` - CRM validation endpoint
- `AUTH_COOKIE_NAME` - Name of the authentication cookie
- `AUTH_COOKIE_MAX_AGE` - Cookie expiration time in seconds

**API Keys:**
- `SESSION_WIPE_API_KEY` - API key for session management
- `USER_MANAGEMENT_API_KEY` - API key for user management

**Public Variables:**
- `NEXT_PUBLIC_CRM_LOGIN_URL` - Client-side accessible CRM login URL
- `NEXT_PUBLIC_CRM_LOGOUT_URL` - Client-side accessible CRM logout URL

## Using with Reverse Proxy (Nginx/Traefik)

### Nginx Example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik Labels (docker-compose.yaml)

Add these labels to your service in docker-compose.yaml:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.vitaliv.rule=Host(`your-domain.com`)"
  - "traefik.http.services.vitaliv.loadbalancer.server.port=3000"
  - "traefik.http.routers.vitaliv.tls=true"
  - "traefik.http.routers.vitaliv.tls.certresolver=letsencrypt"
```

## Monitoring and Logs

### View Logs

```bash
# Follow logs in real-time
docker-compose logs -f

# View last 100 lines
docker-compose logs --tail=100

# View logs for specific service
docker-compose logs -f vitaliv-marketing-tool
```

### Health Checks

The container includes a built-in health check that runs every 30 seconds:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' vitaliv-marketing-tool
```

### Resource Usage

```bash
# Check resource usage
docker stats vitaliv-marketing-tool
```

## Updating the Application

### Pull and Rebuild

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

### Zero-Downtime Update (with multiple instances)

```bash
# Build new image
docker-compose build

# Start new container
docker-compose up -d --scale vitaliv-marketing-tool=2

# Wait for health check to pass
sleep 10

# Remove old container
docker-compose up -d --scale vitaliv-marketing-tool=1
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs vitaliv-marketing-tool

# Verify environment variables
docker-compose config

# Check if port is already in use
netstat -tulpn | grep 3000
```

### Database Connection Issues

```bash
# Test database connectivity from container
docker exec vitaliv-marketing-tool ping your-database-host

# Check environment variables
docker exec vitaliv-marketing-tool env | grep DATABASE_URL
```

### Performance Issues

```bash
# Increase resource limits in docker-compose.yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
```

## Security Best Practices

1. **Never commit `.env.production.local`** to version control
2. **Use secrets management** for sensitive values (Docker Secrets, Vault, etc.)
3. **Run behind HTTPS** using a reverse proxy
4. **Keep the base image updated** by rebuilding regularly
5. **Scan for vulnerabilities**: `docker scan vitaliv-marketing-tool:latest`
6. **Use non-root user** (already configured in Dockerfile)
7. **Limit resource usage** (configured in docker-compose.yaml)

## Backup and Recovery

### Database Backup

The application uses external databases (Neon PostgreSQL and MariaDB). Ensure you have proper backup strategies for:
- Neon database (automatic backups available)
- MariaDB database (regular mysqldump or binary backups)

### Container State

Application state is stored in databases only. No persistent volumes are needed for the container.

## Support

For issues or questions:
- Check logs: `docker-compose logs -f`
- Verify health: `curl http://localhost:3000/api/health`
- Review environment variables: `docker-compose config`
