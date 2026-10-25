# Build context: repository root. No runtime credentials are build arguments.
FROM node:24.22.1-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY app ./app
COPY components ./components
COPY data ./data
COPY lib ./lib
COPY public ./public
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.mjs ./
RUN pnpm build

FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
EXPOSE 8080
# Docker sets HOSTNAME itself, so override it when launching the Next server.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
