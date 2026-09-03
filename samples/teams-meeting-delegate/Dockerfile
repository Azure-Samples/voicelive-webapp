FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
    && corepack prepare pnpm@10.34.3 --activate \
    && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
    && corepack prepare pnpm@10.34.3 --activate \
    && pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server/server/index.js"]
