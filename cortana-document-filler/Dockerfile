FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    wget

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies
RUN npm install
RUN cd server && npm install && cd ..

# Copy application files (excluding node_modules via .dockerignore)
COPY . .

# Build the frontend
RUN npm run build

# Create temp directories
RUN mkdir -p temp server/temp && chmod -R 777 temp server/temp

# Expose ports
EXPOSE 3000 3002

# Health check script
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start both servers
CMD ["sh", "-c", "node simple-server.js & node server/server.js & wait"]


