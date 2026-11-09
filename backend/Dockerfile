# Backend (API) imaji. sunucu/docker-compose.yml tarafindan derlenir.
FROM node:22-alpine
# pg_dump / pg_restore: npm run yedekle ve geri-yukle icin (veritabani PostgreSQL 16)
RUN apk add --no-cache postgresql16-client tzdata
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production
USER node
EXPOSE 5001
# Her acilista yalnizca henuz uygulanmamis migration'lar calisir (veri silinmez), sonra API baslar
CMD ["sh", "-c", "node src/db/migrate.js && exec node src/server.js"]
