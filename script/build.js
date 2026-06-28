const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'dist_release');
const clientDir = path.join(rootDir, 'client');
const serverDir = path.join(rootDir, 'server');
const scriptDir = path.join(rootDir, 'script');
const zipPath = path.join(rootDir, 'anydrop_release.zip');

const serverExclude = new Set(['node_modules', 'data', '.env']);
const serverExcludedExtensions = new Set(['.db', '.sqlite', '.sqlite3']);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const quoteWindowsArg = (value) => {
    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
};

const run = (command, args, cwd) => {
    const result = process.platform === 'win32'
        ? spawnSync(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', `${quoteWindowsArg(command)} ${args.map(quoteWindowsArg).join(' ')}`],
            {
                cwd,
                stdio: 'inherit',
                shell: false
            }
        )
        : spawnSync(command, args, {
            cwd,
            stdio: 'inherit',
            shell: false
        });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} 失败，退出码: ${result.status}`);
    }
};

const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};

const copyRecursiveSync = (src, dest, shouldExclude = () => false) => {
    if (shouldExclude(src)) {
        return;
    }

    const stats = fs.statSync(src);

    if (stats.isDirectory()) {
        ensureDir(dest);
        for (const entry of fs.readdirSync(src)) {
            copyRecursiveSync(path.join(src, entry), path.join(dest, entry), shouldExclude);
        }
        return;
    }

    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
};

const removeIfExists = (targetPath) => {
    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
    }
};

const getTimestampedZipPath = () => {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return path.join(rootDir, `anydrop_release_${stamp}.zip`);
};

const resolveZipOutputPath = () => {
    try {
        removeIfExists(zipPath);
        return zipPath;
    } catch (error) {
        if (error?.code === 'EPERM') {
            const fallbackZipPath = getTimestampedZipPath();
            console.warn(`默认 zip 文件被占用，写入备用路径: ${fallbackZipPath}`);
            removeIfExists(fallbackZipPath);
            return fallbackZipPath;
        }

        throw error;
    }
};

const buildClient = () => {
    console.log('📦 构建前端...');

    if (!fs.existsSync(path.join(clientDir, 'node_modules'))) {
        console.log('   安装前端依赖...');
        run(npmCommand, ['install'], clientDir);
    }

    run(npmCommand, ['run', 'build'], clientDir);
};

const copyServerBundle = () => {
    console.log('📦 复制后端文件...');

    const shouldExcludeServerPath = (sourcePath) => {
        const relativePath = path.relative(serverDir, sourcePath);
        const segments = relativePath.split(path.sep);
        const basename = path.basename(sourcePath);

        return segments.some((segment) => serverExclude.has(segment)) ||
            basename === '.env' ||
            serverExcludedExtensions.has(path.extname(basename).toLowerCase());
    };

    for (const entry of fs.readdirSync(serverDir)) {
        if (serverExclude.has(entry)) continue;
        copyRecursiveSync(
            path.join(serverDir, entry),
            path.join(releaseDir, entry),
            shouldExcludeServerPath
        );
    }
};

const copyClientBundle = () => {
    console.log('🔗 整合静态资源...');

    const clientDist = path.join(clientDir, 'dist');
    if (!fs.existsSync(clientDist)) {
        throw new Error('未找到前端构建产物 client/dist');
    }

    copyRecursiveSync(clientDist, path.join(releaseDir, 'public'));
};

const copyReleaseScripts = () => {
    console.log('📄 复制启动与维护脚本...');

    const scriptFiles = fs.readdirSync(scriptDir)
        .filter((file) => file !== 'build.js')
        .filter((file) => /\.(sh|bat)$/i.test(file));

    for (const file of scriptFiles) {
        const src = path.join(scriptDir, file);
        const dest = path.join(releaseDir, file);
        fs.copyFileSync(src, dest);

        if (file.endsWith('.sh')) {
            try {
                fs.chmodSync(dest, 0o755);
            } catch {
                /* Windows 下忽略 */
            }
        }
    }
};

const writeDockerCompose = () => {
    console.log('🐳 生成 Docker 部署配置...');

    const dockerComposeContent = `services:
  jinvoice-sfu:
    image: \${JINVOICE_IMAGE:-jinvoice-sfu:local}
    build:
      context: .
      dockerfile: Dockerfile
    container_name: jinvoice-sfu
    network_mode: "host"
    env_file:
      - ./.env
    environment:
      NODE_ENV: production
      PORT: 5000
      DATABASE_URL: file:../data/dev.db
    volumes:
      - ./data:/app/data
    restart: always

  jinvoice-turn:
    image: coturn/coturn
    container_name: jinvoice-turn
    network_mode: "host"
    env_file:
      - ./.env
    command:
      - -n
      - --log-file=stdout
      - --min-port=49160
      - --max-port=49200
      - --listening-port=3478
      - --listening-ip=0.0.0.0
      - --external-ip=\${MEDIASOUP_ANNOUNCED_IP:-127.0.0.1}
      - --realm=jinvoice.cn
      - --user=\${TURN_USER:?Set TURN_USER in .env}
      - --lt-cred-mech
      - --fingerprint
    restart: always

# Docker 部署:
#   ./start_app.sh
#
# 非 Docker 部署:
#   ./start_app_nodocker.sh
`;

    fs.writeFileSync(path.join(releaseDir, 'docker-compose.yml'), dockerComposeContent, 'utf8');
};

const writeDockerIgnore = () => {
    const dockerIgnoreContent = `node_modules
logs
data
*.zip
*.tar.gz
*.rar
.env
.deploy_mode
.docker_build_hash
.node_modules_lock_hash
.jinvoice.pid
.jinvoice.win.pid
`;

    fs.writeFileSync(path.join(releaseDir, '.dockerignore'), dockerIgnoreContent, 'utf8');
};

const createZipArchive = () => {
    console.log('📦 创建压缩包...');
    const outputZipPath = resolveZipOutputPath();

    try {
        if (process.platform === 'win32') {
            const result = spawnSync(
                'powershell',
                [
                    '-NoProfile',
                    '-Command',
                    `Compress-Archive -Path '${releaseDir}' -DestinationPath '${outputZipPath}' -Force`
                ],
                {
                    cwd: rootDir,
                    stdio: 'inherit',
                    shell: false
                }
            );

            if (result.error) {
                throw result.error;
            }

            if (result.status !== 0 || !fs.existsSync(outputZipPath)) {
                throw new Error('Compress-Archive 未生成预期的发布压缩包。');
            }
        } else {
            run('zip', ['-r', outputZipPath, 'dist_release'], rootDir);
        }

        console.log(`🎉 压缩包已生成: ${outputZipPath}`);
    } catch (error) {
        console.warn('⚠️ 系统压缩命令失败，尝试使用 adm-zip 回退...');

        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();
            zip.addLocalFolder(releaseDir, 'dist_release');
            zip.writeZip(outputZipPath);
            console.log(`🎉 压缩包已生成: ${outputZipPath}`);
        } catch (fallbackError) {
            console.error('❌ 无法创建压缩包，请手动压缩 dist_release 目录。');
            console.error(fallbackError.message);
        }
    }
};

const main = () => {
    console.log('🚀 开始构建发布版本...');

    removeIfExists(releaseDir);
    ensureDir(releaseDir);

    buildClient();
    copyServerBundle();
    copyClientBundle();
    copyReleaseScripts();
    writeDockerCompose();
    writeDockerIgnore();
    createZipArchive();

    console.log(`✅ 构建完成！发布目录: ${releaseDir}`);
};

main();
