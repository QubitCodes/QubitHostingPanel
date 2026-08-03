ARG RUNTIME_VERSION
FROM node:${RUNTIME_VERSION}-bookworm-slim

ARG NPM_VERSION=12.0.2

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN npm install --global "npm@${NPM_VERSION}" \
	&& corepack enable

USER node
EXPOSE 3000

CMD ["node", "server.js"]
