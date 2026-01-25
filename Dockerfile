# ===================================
# Stage 1: Dependencies
# ===================================
FROM node:20-alpine AS deps

# Install libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# ===================================
# Stage 2: Builder
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Build arguments for environment variables (optional - can use docker-compose env instead)
ARG DATABASE_URL
ARG CRM_BASE_URL
ARG CRM_LOGIN_URL
ARG CRM_VALIDATE_ENDPOINT
ARG AUTH_COOKIE_NAME
ARG AUTH_COOKIE_MAX_AGE
ARG SESSION_WIPE_API_KEY
ARG USER_MANAGEMENT_API_KEY
ARG NEXT_PUBLIC_CRM_LOGIN_URL
ARG NEXT_PUBLIC_CRM_LOGOUT_URL

# Set environment variables for build
ENV DATABASE_URL=${DATABASE_URL}
ENV CRM_BASE_URL=${CRM_BASE_URL}
ENV CRM_LOGIN_URL=${CRM_LOGIN_URL}
ENV CRM_VALIDATE_ENDPOINT=${CRM_VALIDATE_ENDPOINT}
ENV AUTH_COOKIE_NAME=${AUTH_COOKIE_NAME}
ENV AUTH_COOKIE_MAX_AGE=${AUTH_COOKIE_MAX_AGE}
ENV SESSION_WIPE_API_KEY=${SESSION_WIPE_API_KEY}
ENV USER_MANAGEMENT_API_KEY=${USER_MANAGEMENT_API_KEY}
ENV NEXT_PUBLIC_CRM_LOGIN_URL=${NEXT_PUBLIC_CRM_LOGIN_URL}
ENV NEXT_PUBLIC_CRM_LOGOUT_URL=${NEXT_PUBLIC_CRM_LOGOUT_URL}

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build

# ===================================
# Stage 3: Runner (Production)
# ===================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set ownership to nextjs user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
