# syntax=docker/dockerfile:1

# ---- Stage 1: Build ----
FROM node:24-alpine AS build

WORKDIR /app

# Cài dependencies trước để tận dụng cache layer
COPY package.json package-lock.json ./
RUN npm ci

# Copy source và build
COPY . .

# Biến VITE_* được nhúng lúc build (build-time). Override khi cần:
#   docker build --build-arg VITE_API_BASE_URL=https://api.dev.example.com ...
ARG VITE_BASE_PATH=/
ARG VITE_API_BASE_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Stage 2: Serve ----
FROM nginx:1.27-alpine AS runtime

# Cấu hình Nginx cho SPA (history fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Output của Vite được build vào thư mục `docs`
COPY --from=build /app/docs /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
