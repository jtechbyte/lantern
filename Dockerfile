FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
ARG VERSION=0.1.2
ARG REVISION=unknown
ARG CREATED
LABEL org.opencontainers.image.title="Lantern" \
      org.opencontainers.image.description="Self-hosted Stremio discovery and Real-Debrid playback" \
      org.opencontainers.image.source="https://github.com/jtechbyte/lantern" \
      org.opencontainers.image.url="https://github.com/jtechbyte/lantern" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.created=$CREATED
WORKDIR /app
COPY --chown=node:node package.json package-lock.json LICENSE THIRD_PARTY_NOTICES.md ./
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/setup.mjs scripts/doctor.mjs scripts/migrate-sqlite.mjs scripts/check-deployment.mjs scripts/check-rd-name.mjs scripts/check-sources.mjs ./scripts/
COPY --chown=node:node docs/licenses ./docs/licenses
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7001 DATA_DIR=/app/data
EXPOSE 7001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:7001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/main.mjs"]
