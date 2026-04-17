const WebSocket = require('ws');
const fs = require('fs');

const PAGE_ID = '2CA243A4918BCBB307D63F011302E55E';
const PAGE_WS = `ws://127.0.0.1:9222/devtools/page/${PAGE_ID}`;
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
    try {
        const result = await send('Page.captureScreenshot', { format: 'png' });
        if (result.result && result.result.data) {
            fs.writeFileSync(`/tmp/test-${name}.png`, Buffer.from(result.result.data, 'base64'));
            console.log(`  [Screenshot] test-${name}.png`);
        }
    } catch(e) {
        console.log(`  [Screenshot failed] ${e.message}`);
    }
}

async function evaluate(expr, description) {
    const result = await send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
    });
    const val = result.result && result.result.result ? result.result.result.value : 'undefined';
    console.log(`  [${description}] ${val}`);
    return val;
}

ws.on('open', async () => {
    console.log('=== Connected to Chrome ===\n');

    // Enable required domains
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // Wait for page to be fully loaded
    console.log('--- Waiting for page load ---');
    await new Promise(r => setTimeout(r, 5000));

    console.log('\n=== TEST 1: Verify page loaded correctly ===');
    await evaluate(`document.title`, 'Title');
    await evaluate(`document.body ? 'body exists' : 'no body'`, 'Body');
    await evaluate(`document.querySelector('.page-wrapper') ? 'page-wrapper OK' : 'page-wrapper MISSING'`, 'Editor wrapper');
    await evaluate(`document.querySelector('[class*="menu-bar-button"]') || document.querySelectorAll('.menuBarItem').length`, 'Menu bar items');
    await screenshot('1-page-loaded');

    console.log('\n=== TEST 2: Find and click AI button ===');
    const clickResult = await evaluate(`
        (function() {
            // Try various selectors for the AI button
            const selectors = [
                '.menuBarItem',
                '.menu-bar-button',
                '[class*="menuBarItem"]',
                '[class*="menu-bar-button"]',
                'button'
            ];
            for (const sel of selectors) {
                const items = document.querySelectorAll(sel);
                for (const item of items) {
                    const text = (item.textContent || '').trim();
                    const title = item.getAttribute('title') || '';
                    if (text === 'AI' || title.includes('AI') || item.querySelector('img[src*="ai"]')) {
                        item.click();
                        return 'Clicked: ' + item.tagName + ' text="' + text.substring(0, 20) + '"';
                    }
                }
            }
            // Last resort: find any element with "AI" text
            const allEls = document.querySelectorAll('*');
            for (const el of allEls) {
                if (el.children.length === 0 && el.textContent.trim() === 'AI') {
                    el.click();
                    return 'Clicked element with text "AI"';
                }
            }
            return 'AI button NOT found. Debug: ' + Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).join(', ');
        })()
    `, 'Click AI button');

    await new Promise(r => setTimeout(r, 2000));
    await screenshot('2-after-click-ai');

    console.log('\n=== TEST 3: Verify AI panel opened ===');
    const panelInfo = await evaluate(`
        (function() {
            // Look for the AI panel - find by title text
            const allDivs = document.querySelectorAll('div');
            let wrapper = null;
            for (const d of allDivs) {
                if (d.textContent.includes('AI Assistant') && d.querySelectorAll('svg').length > 0) {
                    wrapper = d;
                    break;
                }
            }
            if (!wrapper) return 'AI panel wrapper NOT found';

            // Find all buttons in the header area
            const buttons = wrapper.querySelectorAll('button');
            let info = 'Panel FOUND. ';
            info += buttons.length + ' buttons. ';

            // Find textarea
            const textarea = wrapper.querySelector('textarea');
            if (textarea) info += 'Input✓ ';

            // Find Send button
            const sendBtns = Array.from(buttons).filter(b => b.textContent.trim() === 'Send');
            if (sendBtns.length > 0) info += 'Send✓ ';

            // Find buttons by title
            const titles = Array.from(buttons).map(b => b.getAttribute('title') || '').filter(t => t);
            info += 'Titles: ' + titles.join(', ');

            return info;
        })()
    `, 'AI panel structure');

    console.log('\n=== TEST 4: Check for rendering errors ===');
    await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            let wrapper = null;
            for (const d of allDivs) {
                if (d.textContent.includes('AI Assistant') && d.querySelectorAll('svg').length > 0) {
                    wrapper = d;
                    break;
                }
            }
            if (!wrapper) return 'No panel to check';
            const styles = window.getComputedStyle(wrapper);
            return \`display=\${styles.display} width=\${styles.width} height=\${styles.height}\`;
        })()
    `, 'Panel CSS styles');

    console.log('\n=== TEST 5: Type message in textarea ===');
    await evaluate(`
        (function() {
            const textarea = document.querySelector('textarea');
            if (!textarea) return 'No textarea found';
            // React needs native event for value tracking
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeInputValueSetter.call(textarea, 'make a cat move 10 steps');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Text set: ' + textarea.value;
        })()
    `, 'Enter message');

    await new Promise(r => setTimeout(r, 500));
    await screenshot('3-text-entered');

    console.log('\n=== TEST 6: Check send button state ===');
    await evaluate(`
        (function() {
            const textarea = document.querySelector('textarea');
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.trim() === 'Send') {
                    return \`enabled=\${!b.disabled} text="\${b.textContent.trim()}" textareaValue="\${textarea ? textarea.value : 'none'}"\`;
                }
            }
            return 'Send button not found';
        })()
    `, 'Send button');

    console.log('\n=== TEST 7: Click Send ===');
    await evaluate(`
        (function() {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.trim() === 'Send') {
                    if (b.disabled) return 'Send button disabled!';
                    b.click();
                    return 'Clicked send';
                }
            }
            return 'No send button';
        })()
    `, 'Click Send');

    console.log('\n=== TEST 8: Wait for AI response (10s)... ===');
    // Monitor for loading and response
    await new Promise(r => setTimeout(r, 3000));

    await evaluate(`
        (function() {
            const loading = document.querySelector('[class*="loading-indicator"]');
            const messages = document.querySelectorAll('[class*="message"]');
            const error = document.querySelector('[class*="ai-error"]');
            let status = '';
            if (loading) status += 'Loading... ';
            status += messages.length + ' messages. ';
            if (error) status += 'ERROR: ' + error.textContent.substring(0, 100);
            return status || 'No messages yet';
        })()
    `, 'After 3s');

    await new Promise(r => setTimeout(r, 7000));

    console.log('\n=== TEST 9: Check AI response ===');
    const messages = await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            let wrapper = null;
            for (const d of allDivs) {
                if (d.textContent.includes('AI Assistant') && d.querySelectorAll('svg').length > 0) {
                    wrapper = d;
                    break;
                }
            }
            if (!wrapper) return 'No panel';
            // Find message divs (exclude header and input areas)
            const msgs = wrapper.querySelectorAll('div > div');
            let count = 0;
            let result = '';
            for (const m of msgs) {
                const text = m.textContent.trim();
                if (text.length > 5 && text !== 'AI Assistant' && text !== 'Ask me to create Scratch code!') {
                    count++;
                    result += '[' + count + '] ' + text.substring(0, 100).replace(/\n/g, ' ') + '\n';
                }
            }
            return count === 0 ? 'No new messages' : count + ' messages:\n' + result;
        })()
    `, 'Messages content');

    const errorCheck = await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            for (const d of allDivs) {
                if (d.textContent.includes('Error:')) {
                    return 'ERROR: ' + d.textContent.substring(0, 100);
                }
            }
            return 'No error';
        })()
    `, 'Error check');

    console.log('Messages:', messages);
    console.log('Error:', errorCheck);

    await screenshot('4-after-response');

    console.log('\n=== TEST 10: Click Clear button (trash icon) ===');
    const clearResult = await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            let wrapper = null;
            for (const d of allDivs) {
                if (d.textContent.includes('AI Assistant') && d.querySelectorAll('svg').length > 0) {
                    wrapper = d;
                    break;
                }
            }
            if (!wrapper) return 'No panel';
            const buttons = wrapper.querySelectorAll('button');
            // Find clear button by title
            for (const b of buttons) {
                const title = b.getAttribute('title') || '';
                if (title.includes('Clear') || title.includes('clear')) {
                    b.click();
                    return 'Clicked clear button: ' + title;
                }
            }
            // Fallback: find button with trash-can-like icon (second button usually)
            const btnTitles = Array.from(buttons).map(b => b.getAttribute('title') || '').join(', ');
            return 'Clear button not found. Titles: ' + btnTitles;
        })()
    `, 'Click Clear');

    await new Promise(r => setTimeout(r, 1000));

    const afterClear = await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            for (const d of allDivs) {
                if (d.textContent.includes('Ask me to create Scratch code!')) {
                    return 'All cleared! (empty state shown)';
                }
            }
            return 'Messages remain';
        })()
    `, 'After clear');

    console.log('Clear result:', clearResult);
    console.log('After clear:', afterClear);

    await screenshot('5-after-clear');

    console.log('\n=== TEST 11: Send another message (test multi-turn) ===');
    await evaluate(`
        (function() {
            const textarea = document.querySelector('textarea');
            if (!textarea) return 'No textarea';
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeInputValueSetter.call(textarea, 'add a background');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.trim() === 'Send') {
                    if (!b.disabled) {
                        b.click();
                        return 'Sent second message';
                    }
                    return 'Send button disabled, textarea value: ' + textarea.value;
                }
            }
            return 'Could not send';
        })()
    `, 'Second message');

    await new Promise(r => setTimeout(r, 10000));

    const multiTurnResult = await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            let wrapper = null;
            for (const d of allDivs) {
                if (d.textContent.includes('AI Assistant') && d.querySelectorAll('svg').length > 0) {
                    wrapper = d;
                    break;
                }
            }
            if (!wrapper) return 'No panel';
            const msgs = wrapper.querySelectorAll('div');
            let count = 0;
            for (const m of msgs) {
                if (m.textContent.includes('move') || m.textContent.includes('background')) count++;
            }
            let status = count + ' relevant messages. ';
            return status;
        })()
    `, 'Multi-turn result');
    console.log('Multi-turn:', multiTurnResult);

    await screenshot('6-multi-turn');

    console.log('\n=== TEST 12: Test config panel ===');
    await evaluate(`
        (function() {
            const allDivs = document.querySelectorAll('div');
            let wrapper = null;
            for (const d of allDivs) {
                if (d.textContent.includes('AI Assistant') && d.querySelectorAll('svg').length > 0) {
                    wrapper = d;
                    break;
                }
            }
            if (!wrapper) return 'No panel';
            const buttons = wrapper.querySelectorAll('button');
            // Find settings button by title
            for (const b of buttons) {
                const title = b.getAttribute('title') || '';
                if (title.includes('Settings') || title.includes('设置')) {
                    b.click();
                    return 'Clicked settings button: ' + title;
                }
            }
            return 'Settings button not found';
        })()
    `, 'Open config panel');

    await new Promise(r => setTimeout(r, 1000));

    const configPanel = await evaluate(`
        (function() {
            const inputs = document.querySelectorAll('input');
            let configFound = false;
            for (const inp of inputs) {
                if (inp.getAttribute('placeholder') && inp.getAttribute('placeholder').includes('sk-')) {
                    configFound = true;
                }
            }
            return configFound ? 'Config panel visible' : 'Config panel not visible';
        })()
    `, 'Config panel');
    console.log('Config panel:', configPanel);

    await screenshot('7-config-panel');

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
