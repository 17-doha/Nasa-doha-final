# ---- Stage 1: Build the frontend ----
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build


# ---- Stage 2: Final Image ----
FROM python:3.9-slim-bullseye

WORKDIR /app

# Install system dependencies: Python build tools, Nginx, and Supervisor
RUN apt-get update && apt-get install -y build-essential nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn

# Copy backend code
COPY backend/ .

# Copy built frontend from the builder stage into the Nginx public folder
COPY --from=builder /app/dist /var/www/html

# Copy configuration files for Nginx and Supervisor
COPY nginx.conf /etc/nginx/sites-available/default
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port 80 for Nginx
EXPOSE 80

# Start supervisor to manage both Nginx and Gunicorn
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]