const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/browser/97f996a5-b370-4630-ad19-63c3f4aa3f76');

ws.on('open', async () => {
    const targets = await new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === 1) {
                ws.removeListener('message', handler);
                resolve(msg.result);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({id: 1, method: 'Target.getTargets'}));
    });

    const scratchTarget = targets.targetInfos.find(t => t.url.includes('localhost'));
    if (!scratchTarget) { console.log('No Scratch target found'); ws.close(); return; }

    const {sessionId} = await new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === 2) {
                ws.removeListener('message', handler);
                resolve(msg.result);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({id: 2, method: 'Target.attachToTarget', params: {targetId: scratchTarget.targetId, flatten: true}}));
    });

    await new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.sessionId === sessionId && msg.id === 3) { resolve(); }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({id: 3, method: 'Runtime.enable', sessionId}));
    });

    const logs = [];
    const msgHandler = (data) => {
        const msg = JSON.parse(data);
        if (msg.sessionId === sessionId && msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args.map(a => a.value || a.description || a.type).join(' ');
            logs.push('[' + msg.params.type + '] ' + text);
        }
        if (msg.sessionId === sessionId && msg.method === 'Runtime.exceptionThrown') {
            logs.push('[EXCEPTION] ' + (msg.params.exceptionDetails.exception?.description || JSON.stringify(msg.params.exceptionDetails)));
        }
    };
    ws.on('message', msgHandler);

    // Hard reload (bypass cache)
    await new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.sessionId === sessionId && msg.id === 10) { resolve(); }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({id: 10, method: 'Page.reload', sessionId, params: {ignoreCache: true}}));
    });

    setTimeout(async () => {
        const checkResult = await new Promise((resolve) => {
            const handler = (data) => {
                const msg = JSON.parse(data);
                if (msg.sessionId === sessionId && msg.id === 11) {
                    ws.removeListener('message', handler);
                    resolve(msg.result);
                }
            };
            ws.on('message', handler);
            const expr = `(function() {
                // Check if splash error is gone
                var splash = document.querySelector('.splash');
                var splashVisible = splash && splash.style.display !== 'none' && splash.offsetParent !== null;
                var splashText = document.body.textContent.substring(0, 100);

                // Try to find any visible error text
                var allText = document.body.textContent.substring(0, 500);
                var hasError = allText.indexOf('Something went wrong') !== -1;

                // Check for AI panel
                var aiPanel = document.querySelector('[class*="ai-panel"]') || document.querySelector('[class*="aiPanel"]');

                return JSON.stringify({
                    splashVisible: splashVisible,
                    hasError: hasError,
                    aiPanelFound: !!aiPanel,
                    textPreview: splashText
                });
            })()`;
            ws.send(JSON.stringify({id: 11, method: 'Runtime.evaluate', sessionId, params: {expression: expr, returnByValue: true}}));
        });
        console.log('Page state:', checkResult.result.value);

        const errorLogs = logs.filter(l => l.startsWith('[error]') || l.startsWith('[EXCEPTION]'));
        if (errorLogs.length > 0) {
            console.log('Error logs:', errorLogs.length);
            errorLogs.forEach(l => console.log('  ' + l.substring(0, 300)));
        }
        ws.close();
    }, 10000);
});

ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
});
