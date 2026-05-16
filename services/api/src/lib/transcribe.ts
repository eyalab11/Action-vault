/**
 * Video transcription via OpenAI Whisper.
 *
 * Downloads a video from a URL (e.g. Instagram CDN), streams it to the
 * Whisper API, and returns the transcript text.
 *
 * Cost: ~$0.006 per minute of audio. A typical 30-second Reel costs ~$0.003.
 */

import OpenAI, { toFile } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Download a video from a URL and transcribe its audio using Whisper.
 * Returns the transcript text, or null if transcription fails.
 */
export async function transcribeVideoUrl(
  videoUrl: string,
): Promise<string | null> {
  try {
    console.log('[transcribe] Downloading video…');

    // Download the video into memory.
    // Instagram CDN URLs expire quickly, so we must process immediately.
    // The CDN requires a Referer header from instagram.com or it returns 403.
    const res = await fetch(videoUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        Referer: 'https://www.instagram.com/',
        Origin: 'https://www.instagram.com',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000), // 30s timeout for video download
    });

    if (!res.ok) {
      console.error(`[transcribe] Video download failed: ${res.status}`);
      return null;
    }

    const videoBuffer = Buffer.from(await res.arrayBuffer());
    console.log(
      `[transcribe] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`,
    );

    // Whisper accepts video files directly — it extracts the audio internally.
    // Max file size is 25MB. Instagram Reels are typically 2-10MB.
    if (videoBuffer.length > 25 * 1024 * 1024) {
      console.warn('[transcribe] Video too large for Whisper (>25MB), skipping');
      return null;
    }

    const file = await toFile(videoBuffer, 'video.mp4', {
      type: 'video/mp4',
    });

    console.log('[transcribe] Sending to Whisper…');
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'text',
    });

    const text =
      typeof transcription === 'string'
        ? transcription.trim()
        : (transcription as any).text?.trim() ?? '';

    console.log(
      `[transcribe] Got ${text.length} chars: "${text.slice(0, 100)}…"`,
    );

    return text || null;
  } catch (err) {
    console.error('[transcribe] Failed:', err);
    return null;
  }
}
