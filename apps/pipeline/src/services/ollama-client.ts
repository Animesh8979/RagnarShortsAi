import { config } from '@antigravity/config';
import { logger } from '@antigravity/utils';

export interface OllamaConfig {
  url: string;
  model: string;
}

class OllamaClient {
  private url: string;

  constructor() {
    this.url = config.ollamaUrl;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/tags`, { method: 'GET' });
      return response.ok;
    } catch (error) {
      logger.error('Failed to connect to Ollama, ensure it is running on port 11434.')
      return false;
    }
  }
}

export const ollamaClient = new OllamaClient();
