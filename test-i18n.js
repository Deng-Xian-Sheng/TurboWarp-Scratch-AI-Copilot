const WebSocket = require('ws');

const WS_URL = 'ws://127.0.0.1:9222/devtools/page/7DFA38DD231A11EC5D3C3865521BF827';

function sendCommand(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id === id) {
        ws.removeListener('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({id, method, params}));
  });
}

(async () => {
  const ws = new WebSocket(WS_URL);
  await new Promise(r => ws.on('open', r));
  
  let cmdId = 1;
  const cmd = (method, params) => sendCommand(ws, cmdId++, method, params);
  
  await cmd('Page.enable');
  await cmd('Page.navigate', {url: 'http://localhost:8601'});
  await new Promise(r => setTimeout(r, 8000));
  
  // Check for AI panel text
  const result = await cmd('Runtime.evaluate', {
    expression: `(() => {
      const texts = [];
      document.querySelectorAll('*').forEach(el => {
        const t = el.textContent.trim();
        if (t.length > 2 && t.length < 60 && 
            (t.toLowerCase().includes('ai') || t.includes('助手') || t.includes('发送'))) {
          texts.push(t);
        }
      });
      return [...new Set(texts)].slice(0, 10);
    })()`,
    returnByValue: true
  });
  
  console.log('AI-related texts found:', result.result.value);
  
  // Check locale
  const localeResult = await cmd('Runtime.evaluate', {
    expression: `(() => {
      return {
        lang: document.documentElement.lang,
        url: window.location.href
      };
    })()`,
    returnByValue: true
  });
  
  console.log('Locale:', localeResult.result.value);
  
  ws.close();
})();
