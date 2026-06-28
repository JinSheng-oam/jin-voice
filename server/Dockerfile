# 使用 Node.js 20 作为基础镜像
FROM node:20-slim

# 设置代理环境变量（用于 mediasoup GitHub 依赖下载）
# 如有代理需求，构建时传入：--build-arg HTTP_PROXY=http://your-proxy:port
ARG HTTP_PROXY=""
ARG HTTPS_PROXY=""
ENV http_proxy=${HTTP_PROXY}
ENV https_proxy=${HTTPS_PROXY}
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
# 关键修复：设置 no_proxy，确保国内镜像源不走代理，防止 SSL 报错和减速
ENV no_proxy=localhost,127.0.0.1,mirrors.tuna.tsinghua.edu.cn,registry.npmmirror.com,npmmirror.com,pypi.tuna.tsinghua.edu.cn

# 安装 mediasoup 编译所需的系统依赖
# 使用清华源加速 Debian 软件安装
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    wget \
    python3 \
    python3-pip \
    build-essential \
    pkg-config \
    libssl-dev \
    meson \
    ninja-build \
    && rm -rf /var/lib/apt/lists/* && \
    mkdir -p ~/.pip && \
    echo "[global]" > ~/.pip/pip.conf && \
    echo "index-url = https://pypi.tuna.tsinghua.edu.cn/simple" >> ~/.pip/pip.conf

# pip 配置已移除，不再需要 pip 安装构建工具

# 配置 npm 和 Prisma 国内镜像
ENV npm_config_registry=https://registry.npmmirror.com
ENV npm_config_disturl=https://npmmirror.com/dist
ENV PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma/
ENV PYTHON=python3

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 复制 Prisma Schema（必须在 npm install 之前，因为 @prisma/client postinstall 需要它）
COPY prisma ./prisma/

# 创建 .npmrc 确保 npm 配置生效
RUN echo "registry=https://registry.npmmirror.com" > .npmrc && \
    echo "disturl=https://npmmirror.com/dist" >> .npmrc && \
    echo "python=python3" >> .npmrc

# 预先安装 invoke (mediasoup 构建需要)，确保走清华源且不受 npm 脚本干扰
# Python 3.11+ 需要 --break-system-packages 参数
RUN pip3 install --break-system-packages invoke

# 安装 Node.js 依赖（mediasoup 会通过代理下载 GitHub 依赖并编译）
# Prisma Client 会在 postinstall 时自动生成
RUN npm install --foreground-scripts

# 复制服务器代码
COPY . .

# 清除代理环境变量（运行时不需要）
ENV http_proxy=
ENV https_proxy=
ENV HTTP_PROXY=
ENV HTTPS_PROXY=

# 暴露端口
EXPOSE 5000
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

# 启动命令
CMD ["npm", "start"]
