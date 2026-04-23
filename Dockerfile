# Dark Council Tactic — unified client+server image.
# SPEC §12 (M13) deploy target.
#
# One Node process serves both the built SPA and the WebSocket. Deploy
# target is any container host (Fly, Railway, Render, Fargate, a VPS).

# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Copy lockfile + package first for cache hits on dep installs.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source + configs.
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

# Build the client (vite → dist/) and server (tsc → dist/server/).
RUN npm run build

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bring compiled artifacts from the build stage.
COPY --from=build /app/dist ./dist

# Default production server port. Override with $PORT.
ENV PORT=8080
EXPOSE 8080

# Serve SPA + WS from the same process.
CMD ["node", "dist/server/server/index.js"]
