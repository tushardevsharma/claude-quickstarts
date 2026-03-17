import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import Anthropic from '@anthropic-ai/sdk';

// ─── Configuration ────────────────────────────────────────────────────────────
// Evaluated lazily — env vars from ~/.claude/settings.json are loaded in
// index.js top-level code, which runs AFTER ES module evaluation.
function useBedrock() {
  return process.env.CLAUDE_CODE_USE_BEDROCK === '1' || process.env.USE_BEDROCK === '1';
}

function awsRegion() {
  return process.env.AWS_REGION || 'us-west-2';
}

function bedrockSonnetModel() {
  return process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    'anthropic.claude-sonnet-4-5-20250929-v1:0';
}

function bedrockHaikuModel() {
  return process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    'anthropic.claude-haiku-4-5-20251104-v1:0';
}

const DIRECT_SONNET = 'claude-sonnet-4-5-20250929';
const DIRECT_HAIKU = 'claude-haiku-4-5';

// ─── Clients ──────────────────────────────────────────────────────────────────
let _bedrockClient = null;
let _anthropicClient = null;

function getBedrockClient() {
  if (!_bedrockClient) {
    _bedrockClient = new BedrockRuntimeClient({ region: awsRegion() });
  }
  return _bedrockClient;
}

function getAnthropicClient() {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}

// ─── Bedrock streaming ────────────────────────────────────────────────────────
async function streamViaBedrock({ messages, systemPrompt, model, onToken, onComplete, onError, signal }) {
  const client = getBedrockClient();
  const modelId = model || bedrockSonnetModel();

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const command = new InvokeModelWithResponseStreamCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body,
  });

  let fullText = '';
  try {
    const response = await client.send(command);
    for await (const chunk of response.body) {
      if (signal?.aborted) break;
      if (chunk.chunk?.bytes) {
        let decoded;
        try {
          decoded = JSON.parse(Buffer.from(chunk.chunk.bytes).toString('utf-8'));
        } catch { continue; }

        if (decoded.type === 'content_block_delta' && decoded.delta?.type === 'text_delta') {
          const token = decoded.delta.text;
          fullText += token;
          if (onToken) onToken(token);
        }
      }
    }
    if (onComplete) onComplete(fullText);
    return fullText;
  } catch (err) {
    if (signal?.aborted) return '';
    console.error('[Claude/Bedrock]', err.message);
    if (onError) onError(err);
    throw err;
  }
}

// ─── Direct API streaming ─────────────────────────────────────────────────────
async function streamViaDirect({ messages, systemPrompt, model, onToken, onComplete, onError, signal }) {
  const client = getAnthropicClient();
  const modelId = model || DIRECT_SONNET;
  let fullText = '';

  try {
    const stream = await client.messages.stream({
      model: modelId,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    for await (const chunk of stream) {
      if (signal?.aborted) { stream.controller?.abort(); break; }
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const token = chunk.delta.text;
        fullText += token;
        if (onToken) onToken(token);
      }
    }
    if (onComplete) onComplete(fullText);
    return fullText;
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) return '';
    console.error('[Claude/Direct]', err.message);
    if (onError) onError(err);
    throw err;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function streamClaudeResponse(params) {
  if (useBedrock()) return streamViaBedrock(params);
  return streamViaDirect(params);
}

export async function generateTitle(userMsg, assistantMsg) {
  const content = `Summarize this conversation in 3-5 words as a title. Reply with ONLY the title:\n\nUser: ${userMsg.slice(0, 200)}\nAssistant: ${assistantMsg.slice(0, 200)}`;

  try {
    if (useBedrock()) {
      const client = getBedrockClient();
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 25,
        messages: [{ role: 'user', content }],
      });
      const cmd = new InvokeModelWithResponseStreamCommand({
        modelId: bedrockHaikuModel(),
        contentType: 'application/json',
        accept: 'application/json',
        body,
      });
      const res = await client.send(cmd);
      let title = '';
      for await (const chunk of res.body) {
        if (chunk.chunk?.bytes) {
          try {
            const d = JSON.parse(Buffer.from(chunk.chunk.bytes).toString('utf-8'));
            if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') title += d.delta.text;
          } catch {}
        }
      }
      return title.trim() || 'New Conversation';
    } else {
      const client = getAnthropicClient();
      const res = await client.messages.create({
        model: DIRECT_HAIKU,
        max_tokens: 25,
        messages: [{ role: 'user', content }],
      });
      return res.content[0].text.trim() || 'New Conversation';
    }
  } catch (err) {
    console.warn('[Claude] Title gen failed:', err.message);
    return 'New Conversation';
  }
}

export function buildMessages(messages, summary = null) {
  const MAX = 20;
  let msgs = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX)
    .map(m => ({ role: m.role, content: m.content }));

  if (summary && msgs.length > 0) {
    msgs = [
      { role: 'user', content: `[Conversation summary: ${summary}]` },
      { role: 'assistant', content: 'I have context from our earlier conversation.' },
      ...msgs,
    ];
  }
  return msgs;
}

export function isConfigured() {
  return useBedrock() || !!process.env.ANTHROPIC_API_KEY;
}

// Deferred log — called from index.js after env vars are loaded
export function logConfig() {
  console.log(`[Claude] Using ${useBedrock() ? 'AWS Bedrock' : 'Direct API'}`);
  if (useBedrock()) console.log(`[Claude] Bedrock model: ${bedrockSonnetModel()}`);
}
