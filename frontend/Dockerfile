# Web imaji: once ekranlar derlenir (Vite), sonra Caddy bunlari sunar ve /api isteklerini backend'e iletir.
# Caddy ayari sunucu/Caddyfile'dan baglanir (docker-compose.yml).
FROM node:22-alpine AS derle
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=derle /app/dist /srv
