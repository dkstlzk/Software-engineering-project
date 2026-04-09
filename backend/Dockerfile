FROM node:20-alpine AS deps
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules

COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src

RUN npm run build

FROM node:20-alpine AS migrator
WORKDIR /app

COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY backend/drizzle.config.js ./drizzle.config.js
COPY backend/src ./src
COPY backend/scripts ./scripts

CMD ["npm", "run", "db:push:first-deploy"]

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5000
CMD ["node", "dist/server.js"]
