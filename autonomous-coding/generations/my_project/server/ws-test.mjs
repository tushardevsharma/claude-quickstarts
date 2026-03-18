import { WebSocket } from 'ws';

const results = {};

function testWs(path, label) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:3000${path}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      results[label] = 'TIMEOUT';
      resolve();
    }, 4000);

    ws.on('open', () => {
      process.stdout.write(`[${label}] Connected to ${path}\n`);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        process.stdout.write(`[${label}] Received: ${JSON.stringify(msg)}\n`);
        results[label] = 'OK:' + msg.type;
        clearTimeout(timeout);
        ws.close();
        resolve();
      } catch { /* binary */ }
    });

    ws.on('error', (err) => {
      process.stdout.write(`[${label}] ERROR: ${err.message}\n`);
      results[label] = 'ERROR:' + err.message;
      clearTimeout(timeout);
      resolve();
    });

    ws.on('close', (code) => {
      process.stdout.write(`[${label}] Closed code=${code}\n`);
      if (!results[label]) results[label] = code === 1000 ? 'OK_CLEAN' : 'CLOSED:' + code;
      clearTimeout(timeout);
      resolve();
    });
  });
}

await testWs('/ws', 'main_ws');
await testWs('/ws/tts', 'tts_ws');

process.stdout.write('RESULT_MAIN=' + results.main_ws + '\n');
process.stdout.write('RESULT_TTS=' + results.tts_ws + '\n');
