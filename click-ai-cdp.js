const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B567A20E403D5DD3470FBE50732310AE');

let id = 0;
function send(method, params = {}) {
    return new Promise((resolve) => {
        const msgId = ++id;
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === msgId) {
                ws.removeListener('message', handler);
                resolve(msg);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
    });
}

ws.on('open', async () => {
    console.log('Connected to CDP');
    
    // Wait for page to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Click AI button
    const clickResult = await send('Runtime.evaluate', {
        expression: `
            (function() {
                const buttons = document.querySelectorAll('button');
                for (const b of buttons) {
                    const title = b.getAttribute('title') || '';
                    const text = b.textContent || '';
                    if (title.includes('AI') || text.includes('AI')) {
                        b.click();
                        return 'clicked: ' + title + ' | ' + text.substring(0, 20);
                    }
                }
                return 'not found';
            })()
        `
    });
    console.log('Click result:', JSON.stringify(clickResult));
    
    await new Promise(r => setTimeout(r, 1500));
    
    // Take screenshot
    const ssResult = await send('Page.captureScreenshot', { format: 'png' });
    if (ssResult.result && ssResult.result.data) {
        require('fs').writeFileSync('/tmp/screenshot-ai-clicked.png', 
            Buffer.from(ssResult.result.data, 'base64'));
        console.log('Screenshot saved to /tmp/screenshot-ai-clicked.png');
    }
    
    // Check if AI panel is visible
    const panelCheck = await send('Runtime.evaluate', {
        expression: `
            (function() {
                const panel = document.querySelector('[class*="ai-panel"]');
                return panel ? 'found: ' + panel.className.substring(0, 100) : 'not found';
            })()
        `
    });
    console.log('Panel check:', JSON.stringify(panelCheck));
    
    ws.close();
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('WS Error:', err.message);
    process.exit(1);
});
