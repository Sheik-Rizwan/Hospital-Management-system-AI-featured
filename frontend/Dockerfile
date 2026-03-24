# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_API_BASE="http://localhost:5000/api"
ARG VITE_SOCKET_URL="http://localhost:5000"

# Set them as environment variables so Vite can embed them during build
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Copy package.json and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY . .

# Build the app for production
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:alpine

# Copy the build output from Stage 1 to Nginx's web root
COPY --from=build /app/dist /usr/share/nginx/html

# Add a custom nginx config to support React Router (fallback to index.html for SPA)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
