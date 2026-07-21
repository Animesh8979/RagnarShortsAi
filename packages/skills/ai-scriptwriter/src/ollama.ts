// Lightweight Ollama API client (no external deps)

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface OllamaOptions {
  model: string;
  messages: OllamaMessage[];
  temperature?: number;
  format?: 'json';
}

export interface OllamaResponse {
  message: { role: string; content: string };
  done: boolean;
}

export class OllamaClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = 'http://localhost:11434', apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async chat(options: {
    model: string;
    messages: OllamaMessage[];
    temperature?: number;
    format?: 'json';
  }): Promise<string> {
    const isLocalRouter = this.baseUrl.includes('8765') || this.baseUrl.includes('/v1');
    const url = isLocalRouter ? `${this.baseUrl}/chat/completions` : `${this.baseUrl}/api/chat`;

    const body: any = isLocalRouter ? {
      model: options.model,
      messages: options.messages,
      stream: false,
      temperature: options.temperature ?? 0.9,
      response_format: options.format === 'json' ? { type: 'json_object' } : undefined
    } : {
      model: options.model,
      messages: options.messages,
      stream: false,
      format: options.format,
      options: {
        temperature: options.temperature ?? 0.9,
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok && !isLocalRouter && res.status === 404) {
        return this.chatWithOpenAI(options);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error: ${res.status} ${text}`);
      }

      const data = await res.json() as any;
      if (isLocalRouter || data.choices) {
        return data.choices?.[0]?.message?.content ?? '';
      }
      return data.message?.content ?? '';
    } catch (err: any) {
      if (!isLocalRouter) {
        try {
          return await this.chatWithOpenAI(options);
        } catch (innerErr) {
          throw err;
        }
      }
      throw err;
    }
  }

  private async chatWithOpenAI(options: {
    model: string;
    messages: OllamaMessage[];
    temperature?: number;
    format?: 'json';
  }): Promise<string> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: options.model,
      messages: options.messages,
      stream: false,
      temperature: options.temperature ?? 0.9,
      response_format: options.format === 'json' ? { type: 'json_object' } : undefined
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI Fallback API error: ${res.status} ${text}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async generate(options: {
    model: string;
    prompt: string;
    system?: string;
    temperature?: number;
    format?: 'json';
  }): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;
    const body = {
      model: options.model,
      prompt: options.prompt,
      system: options.system ?? '',
      stream: false,
      format: options.format,
      options: {
        temperature: options.temperature ?? 0.9,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { response: string };
    return data.response ?? '';
  }
}
