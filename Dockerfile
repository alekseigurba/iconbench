FROM node:22-alpine

WORKDIR /srv

# No dependencies and no build step: the app is ES modules the browser reads,
# and the server is Node's own http module. So there is nothing to install.
COPY package.json ./
COPY app ./app
COPY scripts ./scripts

ENV NODE_ENV=production
ENV STORAGE_DIR=/store
ENV PORT=8010

EXPOSE 8010
VOLUME ["/store"]

CMD ["node", "scripts/serve.mjs", "app"]
