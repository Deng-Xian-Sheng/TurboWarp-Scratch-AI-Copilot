const WebSocket = require('ws');

async function runTests() {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    const versionData = await res.json();
    const ws = new WebSocket(versionData.webSocketDebuggerUrl);

    ws.on('open', async () => {
        try {
            const targets = await sendMsg(ws, 1, 'Target.getTargets', {});
            const scratchTarget = targets.targetInfos.find(t => t.url.includes('localhost'));
            const {sessionId} = await sendMsg(ws, 2, 'Target.attachToTarget', {
                targetId: scratchTarget.targetId, flatten: true
            });
            await sendMsg(ws, 3, 'Runtime.enable', {}, sessionId);

            const logs = [];
            ws.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args.map(a => a.value || a.description || a.type).join(' ');
                    logs.push({type: msg.params.type, text: text.substring(0, 300)});
                }
                if (msg.method === 'Runtime.exceptionThrown') {
                    logs.push({type: 'EXCEPTION', text: JSON.stringify(msg.params.exceptionDetails).substring(0, 300)});
                }
            });

            ws.send(JSON.stringify({id: 10, method: 'Page.reload', sessionId, params: {ignoreCache: true}}));
            console.log('Reloaded, waiting 15s...');
            await sleep(15000);

            // Deep React tree inspection
            const deepCheck = await evaluate(ws, 11, sessionId, function() {
                var appEl = document.getElementById('app');
                var fiberKey = null;
                for (var key in appEl) {
                    if (key.startsWith('__react')) { fiberKey = key; break; }
                }

                var fiber = appEl[fiberKey];
                // Walk down to find the Provider and then the GUI component
                var node = fiber;
                var depth = 0;
                var components = [];
                var visited = 0;
                var queue = [{node: node, depth: 0}];

                while (queue.length > 0 && visited < 100) {
                    var item = queue.shift();
                    var n = item.node;
                    visited++;
                    if (!n) continue;

                    var displayName = '';
                    if (n.type && n.type.displayName) {
                        displayName = n.type.displayName;
                    } else if (n.type && n.type.name) {
                        displayName = n.type.name;
                    } else if (n.elementType && n.elementType.displayName) {
                        displayName = n.elementType.displayName;
                    } else if (typeof n.type === 'string') {
                        displayName = n.type; // DOM element like 'div'
                    }

                    if (displayName) {
                        components.push({depth: item.depth, name: displayName.substring(0, 60)});
                    }

                    if (n.child) queue.push({node: n.child, depth: item.depth + 1});
                    if (n.sibling) queue.push({node: n.sibling, depth: item.depth});
                }

                // Also check: what's the text content of #app?
                var appText = appEl.textContent.substring(0, 500);

                // Check: is there a GUI component rendered?
                // Check visible elements on page
                var visibleTexts = [];
                var allEls = document.querySelectorAll('#app *');
                for (var i = 0; i < Math.min(allEls.length, 200); i++) {
                    var el = allEls[i];
                    if (el.children.length <= 2 && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
                        var cs = getComputedStyle(el);
                        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
                            visibleTexts.push(el.textContent.trim());
                        }
                    }
                }

                return {
                    componentCount: components.length,
                    componentTree: components.slice(0, 60),
                    appText: appText,
                    visibleTexts: visibleTexts.slice(0, 30)
                };
            });
            console.log('React tree (first 60 nodes):');
            deepCheck.componentTree.forEach(c => {
                console.log('  ' + '  '.repeat(c.depth) + c.name);
            });
            console.log('\nApp text preview:', deepCheck.appText.substring(0, 300));
            console.log('\nVisible texts on page:', deepCheck.visibleTexts);

            // Check the splash element more carefully
            const splashCheck = await evaluate(ws, 12, sessionId, function() {
                var splashScreen = document.querySelector('.splash-screen');
                var r = {
                    exists: !!splashScreen,
                    hidden: splashScreen ? splashScreen.hasAttribute('hidden') : null,
                    display: splashScreen ? getComputedStyle(splashScreen).display : null,
                    visibility: splashScreen ? getComputedStyle(splashScreen).visibility : null,
                    parent: splashScreen && splashScreen.parentElement ? splashScreen.parentElement.tagName : null,
                    textContent: splashScreen ? splashScreen.textContent.substring(0, 200) : null
                };
                return r;
            });
            console.log('\nSplash element:', JSON.stringify(splashCheck));

            await sleep(3000);
            const errors = logs.filter(l => l.type === 'error' && !l.text.includes('Warning'));
            if (errors.length > 0) {
                console.log('\n=== ERRORS ===');
                errors.forEach(e => console.log('  ' + e.text.substring(0, 200)));
            }

        } catch (err) {
            console.log('Test error:', err.message);
        }
        ws.close();
    });
}

function sendMsg(ws, id, method, params, sessionId) {
    return new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === id) {
                ws.removeListener('message', handler);
                resolve(msg.result);
            }
        };
        ws.on('message', handler);
        const message = {id, method};
        if (sessionId) message.sessionId = sessionId;
        if (params) message.params = params;
        ws.send(JSON.stringify(message));
    });
}

function evaluate(ws, id, sessionId, fn) {
    return sendMsg(ws, id, 'Runtime.evaluate', {
        expression: '(' + fn.toString() + ')()',
        returnByValue: true
    }, sessionId).then(result => {
        if (result && result.result) {
            var val = result.result.value;
            if (val !== undefined && val !== null) {
                return typeof val === 'string' ? JSON.parse(val) : val;
            }
        }
        return {error: 'bad result'};
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

runTests();
