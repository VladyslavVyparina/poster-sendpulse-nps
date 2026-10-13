FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY admin ./admin
RUN npx tsc && npm prune --omit=dev

RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/nps.sqlite
EXPOSE 3000

CMD ["node", "dist/index.js"]
