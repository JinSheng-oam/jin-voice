const { spawnSync } = require('child_process');

if (process.platform !== 'win32') {
    process.exit(0);
}

const commandShell = process.env.ComSpec || 'cmd.exe';

const quoteCmdArg = (value) => {
    const text = String(value);
    if (!/[\s"&|<>^]/u.test(text)) {
        return text;
    }

    return `"${text.replace(/"/g, '\\"')}"`;
};

const runUpdateScript = (args) => spawnSync(
    commandShell,
    ['/d', '/s', '/c', ['script\\update_app.bat', ...args].map(quoteCmdArg).join(' ')],
    {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: false
    }
);

const invalidCases = [
    {
        label: 'parent directory archive path',
        args: ['--yes', '--archive', '..\\bad.zip'],
        expected: '更新包必须位于当前部署目录'
    },
    {
        label: 'unsupported archive extension',
        args: ['--yes', '--archive', 'bad.txt'],
        expected: '不支持的更新包格式'
    }
];

for (const testCase of invalidCases) {
    const result = runUpdateScript(testCase.args);
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    if (result.status === 0) {
        console.error(`Expected update_app.bat to reject ${testCase.label}.`);
        process.exit(1);
    }

    if (!output.includes(testCase.expected)) {
        console.error(`Unexpected update_app.bat output for ${testCase.label}.`);
        console.error(output);
        process.exit(1);
    }
}

console.log('Windows update script validation passed.');
