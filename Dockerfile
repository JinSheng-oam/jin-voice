FROM node:20-bookworm-slim AS client-builder

WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./

ARG VITE_TURN_SERVER=""
ARG VITE_TURN_USERNAME=""
ARG VITE_TURN_PASSWORD=""
ARG VITE_SERVER_URL=""
ENV VITE_TURN_SERVER=${VITE_TURN_SERVER}
ENV VITE_TURN_USERNAME=${VITE_TURN_USERNAME}
ENV VITE_TURN_PASSWORD=${VITE_TURN_PASSWORD}
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

RUN npm run build

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    pkg-config \
    libssl-dev \
    && pip3 install --break-system-packages invoke \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/package*.json ./
COPY server/prisma ./prisma/
RUN npm ci --foreground-scripts

COPY server/ ./
COPY --from=client-builder /client/dist ./public/

ENV NODE_ENV=production
EXPOSE 5000
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

CMD ["npm", "start"]
