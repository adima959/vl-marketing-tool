#!/bin/bash

# Vitaliv Marketing Tool - Production Deployment Script
# This script helps deploy the application to Docker

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

print_info "Starting deployment process..."

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    print_error ".env.production file not found!"
    print_info "Please create .env.production with your production environment variables."
    exit 1
fi

# Prompt for deployment confirmation
print_warning "This will deploy the application to production."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Deployment cancelled."
    exit 0
fi

# Pull latest code (if in a git repository)
if [ -d ".git" ]; then
    print_info "Pulling latest code from git..."
    git pull origin main || print_warning "Could not pull from git. Continuing anyway..."
fi

# Stop existing containers
print_info "Stopping existing containers..."
docker-compose down || true

# Build the Docker image
print_info "Building Docker image..."
docker-compose build

# Start the containers
print_info "Starting containers..."
docker-compose up -d

# Wait for container to be healthy
print_info "Waiting for application to be healthy..."
sleep 10

# Check health
HEALTH_CHECK=$(curl -s http://localhost:3000/api/health || echo "failed")

if [[ $HEALTH_CHECK == *"ok"* ]]; then
    print_info "✅ Deployment successful!"
    print_info "Application is running at: http://localhost:3000"
    print_info "Health check: http://localhost:3000/api/health"

    # Show logs
    echo ""
    print_info "Recent logs:"
    docker-compose logs --tail=20

    echo ""
    print_info "To view live logs, run: docker-compose logs -f"
else
    print_error "❌ Health check failed!"
    print_error "Application may not be running correctly."
    echo ""
    print_info "Showing logs:"
    docker-compose logs --tail=50
    exit 1
fi
