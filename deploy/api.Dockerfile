# Life Simulator API (Fastify). Built from the repository root.
FROM node:22-slim
WORKDIR /app
COPY shared/contracts/package*.json shared/contracts/
RUN npm --prefix shared/contracts ci
COPY server/package*.json server/
RUN npm --prefix server ci
COPY shared ./shared
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
WORKDIR /app/server
# Railway injects PORT; secrets come from service variables, never from files.
ENV HOST=0.0.0.0 STORAGE_MODE=local DATA_DIR=/data LOG_LEVEL=info
CMD ["npx", "tsx", "src/index.ts"]
