const WebSocket = require('ws');
const fs = require('fs');

const PAGE_WS = 'ws://127.0.0.1:9224/devtools/page/D150F589D94F5C5F167AEDC73D7E73BA';
const ws = new WebSocket(PAGE_WS);

let msgId = 0;
function send(method, params = {}) {
    return new Promise((resolve) => {
        const id = ++msgId;
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                ws.removeListener('message', handler);
                resolve(msg);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function screenshot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    if (result.result && result.result.data) {
        fs.writeFileSync(`/tmp/test-${name}.png`, Buffer.from(result.result.data, 'base64'));
        console.log(`Screenshot saved: /tmp/test-${name}.png`);
    }
}

async function evaluate(expr, description) {
    const result = await send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
    });
    const val = result.result && result.result.result ? result.result.result.value : 'undefined';
    console.log(`[${description}]`, val);
    return val;
}

ws.on('open', async () => {
    console.log('Connected to Deepin browser');

    // Enable Page and Runtime
    await send('Page.enable');
    await send('Runtime.enable');

    // Wait a bit for page to settle
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n=== TEST 1: Check page loaded ===');
    await evaluate(`document.title`, 'Page title');
    await evaluate(`document.querySelector('.page-wrapper') ? 'page-wrapper found' : 'page-wrapper missing'`, 'Editor wrapper');
    await evaluate(`document.querySelector('[class*="ai-panel"]') ? 'AI button found' : 'AI button missing'`, 'AI button exists');
    await screenshot('1-loaded');

    console.log('\n=== TEST 2: Click AI button to open panel ===');
    await evaluate(`
        (function() {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                const text = (b.textContent || '').trim();
                const title = b.getAttribute('title') || '';
                if (text === 'AI' || title.includes('AI')) {
                    b.click();
                    return 'clicked AI button';
                }
            }
            // Try by menu bar
            const items = document.querySelectorAll('.menu-bar-button, .menuBarItem, [class*="menuBar"]');
            for (const item of items) {
                if (item.textContent && item.textContent.includes('AI')) {
                    item.click();
                    return 'clicked AI menu item';
                }
            }
            return 'AI button not found';
        })()
    `, 'Click AI button');

    await new Promise(r => setTimeout(r, 1500));
    await screenshot('2-ai-panel-open');

    console.log('\n=== TEST 3: Check AI panel rendered ===');
    await evaluate(`
        (function() {
            const panel = document.querySelector('[class*="ai-panel-wrapper"]');
            if (!panel) return 'AI panel wrapper not found';
            const header = panel.querySelector('[class*="ai-panel-header"]');
            const input = panel.querySelector('textarea');
            const sendBtn = panel.querySelector('button[class*="ai-send-btn"]');
            const configBtn = panel.querySelector('button[title*="Settings"]') || panel.querySelectorAll('button')[3];
            const trashBtn = panel.querySelector('button[title*="Delete all blocks"]');
            const clearBtn = panel.querySelector('button[title*="Clear chat"]');

            let info = 'Panel found. ';
            if (header) info += 'Header: yes. ';
            if (input) info += 'Input: yes. ';
            if (sendBtn) info += 'Send button: yes. ';
            if (trashBtn) info += 'Trash button: yes. ';
            if (clearBtn) info += 'Clear button: yes. ';
            return info;
        })()
    `, 'AI panel structure');

    console.log('\n=== TEST 4: Check for errors in console ===');
    const consoleErrors = await evaluate(`
        (function() {
            if (!window._testErrors) return 'No errors collected';
            return window._testErrors.join('; ');
        })()
    `, 'Console errors');

    console.log('\n=== TEST 5: Type a message in the textarea ===');
    await evaluate(`
        (function() {
            const textarea = document.querySelector('[class*="ai-panel-wrapper"] textarea');
            if (!textarea) return 'No textarea found';
            textarea.value = 'move 10 steps when green flag clicked';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Text entered: ' + textarea.value;
        })()
    `, 'Enter message text');

    await new Promise(r => setTimeout(r, 500));
    await screenshot('3-text-entered');

    console.log('\n=== TEST 6: Click Send button ===');
    await evaluate(`
        (function() {
            const sendBtn = document.querySelector('button[class*="ai-send-btn"]');
            if (!sendBtn) return 'Send button not found';
            if (sendBtn.disabled) return 'Send button disabled';
            sendBtn.click();
            return 'Send button clicked';
        })()
    `, 'Click Send');

    // Wait for API response
    console.log('\n=== TEST 7: Wait for response... ===');
    await new Promise(r => setTimeout(r, 8000));
    await screenshot('4-after-send');

    console.log('\n=== TEST 8: Check response and error ===');
    const messages = await evaluate(`
        (function() {
            const msgs = document.querySelectorAll('[class*="message"]');
            if (msgs.length === 0) return 'No messages yet';
            let result = msgs.length + ' messages: ';
            for (const m of msgs) {
                result += '"' + m.textContent.substring(0, 60) + '" | ';
            }
            return result;
        })()
    `, 'Messages');

    const errorText = await evaluate(`
        (function() {
            const err = document.querySelector('[class*="ai-error"]');
            return err ? 'Error: ' + err.textContent.substring(0, 100) : 'No error element';
        })()
    `, 'Error display');

    console.log('Messages:', messages);
    console.log('Error:', errorText);

    console.log('\n=== TEST 9: Click Clear button (trash icon) ===');
    const clearBtnResult = await evaluate(`
        (function() {
            const clearBtn = document.querySelector('button[title*="Clear chat"]');
            if (!clearBtn) return 'Clear button not found';
            // Click the button element itself (not children)
            clearBtn.click();
            return 'Clear button clicked';
        })()
    `, 'Click Clear button');
    console.log('Clear button:', clearBtnResult);

    await new Promise(r => setTimeout(r, 1000));
    await screenshot('5-after-clear');

    const afterClear = await evaluate(`
        (function() {
            const msgs = document.querySelectorAll('[class*="message"]');
            return msgs.length === 0 ? 'Messages cleared' : msgs.length + ' messages remain';
        })()
    `, 'After clear');
    console.log('After clear:', afterClear);

    console.log('\n=== ALL TESTS COMPLETE ===');
    ws.close();
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('WebSocket Error:', err.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('WebSocket closed');
    process.exit(0);
});
