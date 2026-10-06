const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            l10n: { t: message => message },
            window: {},
            workspace: {},
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { utf8Chunks, sendTerminalText } = require('../extension.js')._internals;
Module._load = originalLoad;

test('utf8Chunks preserves text and never splits a UTF-8 character', () => {
    const source = 'abc编译烧录🚀'.repeat(100);
    const chunks = utf8Chunks(source, 256);
    assert.equal(chunks.join(''), source);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) assert.ok(Buffer.byteLength(chunk, 'utf8') <= 256);
});

test('macOS terminal writes are chunked, serialized, and executed once', async () => {
    const calls = [];
    const terminal = { sendText: (text, execute) => calls.push({ text, execute }) };
    const first = 'a'.repeat(757);
    const second = '中文'.repeat(180);

    await Promise.all([
        sendTerminalText(terminal, first, true),
        sendTerminalText(terminal, second, true),
    ]);

    if (process.platform !== 'darwin') {
        assert.deepEqual(calls, [
            { text: first, execute: true },
            { text: second, execute: true },
        ]);
        return;
    }

    const commands = [];
    let current = '';
    for (const call of calls) {
        if (call.execute) {
            assert.equal(call.text, '');
            commands.push(current);
            current = '';
        } else {
            assert.ok(Buffer.byteLength(call.text, 'utf8') <= 256);
            current += call.text;
        }
    }
    assert.equal(current, '');
    assert.deepEqual(commands, [first, second]);
});
