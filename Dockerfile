FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hono
WORKDIR /app
COPY --from=builder --chown=hono:nodejs /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
USER hono
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
