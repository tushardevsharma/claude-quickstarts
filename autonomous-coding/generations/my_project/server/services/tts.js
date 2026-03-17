/**
 * TTS Service - abstraction layer for text-to-speech.
 * Supports ElevenLabs (primary) with graceful degradation.
 *
 * In the current implementation, TTS is handled client-side using
 * the Web Speech API when ElevenLabs is not configured.
 * When ElevenLabs is configured, this service proxies requests.
 */

import https from 'https';

const ELEVENLABS_BASE = 'api.elevenlabs.io';

/**
 * Check if ElevenLabs is configured
 */
export function isElevenLabsConfigured() {
  return !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim());
}

/**
 * Synthesize text to audio using ElevenLabs streaming API.
 * Returns a readable stream of MP3 audio data.
 */
export function synthesizeElevenLabs(text, voiceId, onChunk, onComplete, onError) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  const body = JSON.stringify({
    text,
    model_id: 'eleven_turbo_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
    optimize_streaming_latency: 3,
  });

  const options = {
    hostname: ELEVENLABS_BASE,
    path: `/v1/text-to-speech/${voice}/stream`,
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    if (res.statusCode !== 200) {
      let errorBody = '';
      res.on('data', (chunk) => { errorBody += chunk; });
      res.on('end', () => {
        const err = new Error(`ElevenLabs API error: ${res.statusCode} ${errorBody}`);
        if (onError) onError(err);
      });
      return;
    }

    res.on('data', (chunk) => {
      if (onChunk) onChunk(chunk);
    });

    res.on('end', () => {
      if (onComplete) onComplete();
    });

    res.on('error', (err) => {
      if (onError) onError(err);
    });
  });

  req.on('error', (err) => {
    if (onError) onError(err);
  });

  req.write(body);
  req.end();

  return req;
}

/**
 * Get available voices from ElevenLabs
 */
export async function getElevenLabsVoices() {
  if (!isElevenLabsConfigured()) return [];

  return new Promise((resolve, reject) => {
    const options = {
      hostname: ELEVENLABS_BASE,
      path: '/v1/voices',
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.voices || []);
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.end();
  });
}
