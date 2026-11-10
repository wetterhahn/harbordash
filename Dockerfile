FROM node:22-alpine

LABEL org.opencontainers.image.title="HarborDash"
LABEL org.opencontainers.image.description="A small Docker-friendly browser-managed startpage for home labs."
LABEL org.opencontainers.image.source="https://github.com/wetterhahn/harbordash"

WORKDIR /app
COPY package.json server.js auth.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
CMD ["node", "server.js"]
