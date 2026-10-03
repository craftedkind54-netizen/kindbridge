FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY bot ./bot
ENV NODE_ENV=production DATA_DIR=/data
CMD ["node", "bot/src/main.js"]
