'use strict';

const { GoogleGenAI } = require('@google/genai');

/**
 * lib/providers/google-veo-vertex.js
 * 
 * Secure, API-driven implementation of Google Veo 3.1 video generation via Vertex AI.
 * Requires GOOGLE_CLOUD_PROJECT to be set in the environment.
 */

async function generateMotionVideo(prompt, config = {}) {
  console.log('[provider-google-veo-vertex] Init video generation...');
  
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is missing.');
  }

  // Initialize with vertexai wrapper
  const ai = new GoogleGenAI({ 
    vertexai: { 
      project: process.env.GOOGLE_CLOUD_PROJECT, 
      location: 'us-central1' // Veo 3.1 is typically in us-central1
    } 
  });
  
  const finalPrompt = `cinematic 4k, hyperrealistic, masterclass lighting, trending on artstation. ${prompt}`;
  console.log(`[provider-google-veo-vertex] Submitting prompt to Veo 3.1 (Vertex): "${finalPrompt.substring(0, 80)}..."`);

  // generateVideos returns a Long Running Operation (LRO)
  const operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: finalPrompt,
    config: {
      aspectRatio: '9:16',
      resolution: '720p',
    }
  });

  console.log('[provider-google-veo-vertex] Generation started. Polling LRO...');

  const startMs = Date.now();
  const timeoutMs = 180_000; // 3 minute ceiling
  
  let currentOperation = operation;
  
  while (!currentOperation.done) {
    if (Date.now() - startMs > timeoutMs) {
       throw new Error('Vertex AI Polling Timeout: 180s ceiling breached.');
    }
    await new Promise(r => setTimeout(r, 8000)); // Poll every 8s
    
    try {
      // Dynamic LRO polling using ai.operations.get
      // Assuming operation object has a 'name' field for the LRO identifier
      if (currentOperation.name) {
         currentOperation = await ai.operations.get(currentOperation.name);
      } else {
         // Fallback if the SDK handles it differently
         console.warn('[provider-google-veo-vertex] Warning: operation.name is missing. Cannot poll dynamically.');
         break;
      }
    } catch (pollErr) {
      console.error('[provider-google-veo-vertex] Polling error:', pollErr.message);
    }
  }
  
  if (currentOperation.error) {
    throw new Error(`Vertex AI Generation Error: ${currentOperation.error.message || JSON.stringify(currentOperation.error)}`);
  }
  
  if (!currentOperation.result || !currentOperation.result.uri) {
    // If we couldn't poll properly, maybe the original operation had the result?
    if (operation.result && operation.result.uri) {
      return operation.result.uri;
    }
    throw new Error('Vertex AI Safety Filter or Generation Failure: No URI returned.');
  }
  
  console.log('[provider-google-veo-vertex] Generation complete! URI:', currentOperation.result.uri);
  return currentOperation.result.uri;
}

module.exports = { generateMotionVideo };
