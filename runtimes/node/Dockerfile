ARG RUNTIME_VERSION
FROM node:${RUNTIME_VERSION}-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN corepack enable

USER node
EXPOSE 3000

CMD ["node", "server.js"]
