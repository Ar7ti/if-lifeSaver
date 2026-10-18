# Life Simulator web app: static Vite build served by Caddy with SPA fallback.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY shared/contracts/package*.json shared/contracts/
RUN npm --prefix shared/contracts ci
COPY . .
# Public API base, e.g. https://api.example.up.railway.app/api (not a secret).
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/Caddyfile.public /etc/caddy/Caddyfile.public
# Existing deployments keep the original config. Public proxy is explicitly opt-in.
CMD ["sh", "-c", "exec caddy run --config /etc/caddy/${CADDY_CONFIG:-Caddyfile} --adapter caddyfile"]
