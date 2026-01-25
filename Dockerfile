# ===================================
# Stage 1: Dependencies
# ===================================
FROM node:20-alpine AS deps

# Install libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (use npm install instead of npm ci for better compatibility)
RUN npm install

# ===================================
# Stage 2: Builder
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Build arguments - only NEXT_PUBLIC_ variables are needed at build time
ARG NEXT_PUBLIC_CRM_LOGIN_URL=https://vitaliv.no/admin/site/marketing
ARG NEXT_PUBLIC_CRM_LOGOUT_URL=https://vitaliv.no/admin

# Set NEXT_PUBLIC environment variables for build (embedded in client bundle)
ENV NEXT_PUBLIC_CRM_LOGIN_URL=${NEXT_PUBLIC_CRM_LOGIN_URL}
ENV NEXT_PUBLIC_CRM_LOGOUT_URL=${NEXT_PUBLIC_CRM_LOGOUT_URL}

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build && \
    echo "Build completed. Listing .next directory:" && \
    ls -la .next/ && \
    echo "Checking for standalone directory:" && \
    ls -la .next/standalone/ || echo "Standalone directory not found"

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

# Copy built application from builder with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check (using wget which is available in Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
