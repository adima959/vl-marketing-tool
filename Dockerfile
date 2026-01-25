# ===================================
# Stage 1: Dependencies
# ===================================
FROM node:20-slim AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && \
    apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with legacy peer deps flag for compatibility
RUN npm install --legacy-peer-deps --no-audit --no-fund

# ===================================
# Stage 2: Builder
# ===================================
FROM node:20-slim AS builder

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

# Increase Node.js memory limit for build (4GB)
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build Next.js application
RUN npm run build

# ===================================
# Stage 3: Runner (Production)
# ===================================
FROM node:20-slim AS runner

WORKDIR /app

# Install wget for health checks
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy package files
COPY --from=builder /app/package*.json ./

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy built Next.js application
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy next.config.js if it exists
COPY --from=builder /app/next.config.js* ./

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname and port
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start Next.js in production mode
CMD ["npm", "run", "start"]
