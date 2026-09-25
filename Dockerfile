# 前端构建阶段：pnpm 工作区，使用仓库根 pnpm-lock.yaml
FROM node:22-bookworm-slim AS client-builder

RUN npm install -g pnpm@11.24.0

WORKDIR /src
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter client

COPY client/ ./client/

ARG VITE_SERVER_URL=""
ARG VITE_TURN_SERVER=""
ARG VITE_TURN_USERNAME=""
ARG VITE_TURN_PASSWORD=""
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV VITE_TURN_SERVER=${VITE_TURN_SERVER}
ENV VITE_TURN_USERNAME=${VITE_TURN_USERNAME}
ENV VITE_TURN_PASSWORD=${VITE_TURN_PASSWORD}

RUN pnpm --filter client run build

# 服务端依赖阶段：mediasoup / Prisma 的构建脚本需要编译工具链
FROM node:22-bookworm-slim AS server-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    pkg-config \
    libssl-dev \
    && pip3 install --break-system-packages invoke \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.24.0

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY server/prisma ./server/prisma/
RUN pnpm install --frozen-lockfile --prod --filter server

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    pkg-config \
    libssl-dev \
    ffmpeg \
    && pip3 install --break-system-packages invoke \
    && rm -rf /var/lib/apt/lists/*

# 保持 pnpm 工作区布局：server 项目位于 /app/server，虚拟存储在 /app/node_modules
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=client-builder /src/client/dist ./server/public/

# Prisma resolves file:../data/dev.db from /app/server/prisma; keep it on the existing /app/data volume.
RUN mkdir -p /app/data && ln -s /app/data /app/server/data

ENV NODE_ENV=production
ARG JINVOICE_VERSION=""
ENV JINVOICE_VERSION=${JINVOICE_VERSION}
EXPOSE 5000
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

WORKDIR /app/server
CMD ["npm", "start"]
