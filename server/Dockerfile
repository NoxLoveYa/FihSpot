FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
RUN npm ci -w server --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=server/prisma/schema.prisma && npm run build -w server

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/package.json ./server/package.json
WORKDIR /app/server
RUN mkdir -p uploads
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
