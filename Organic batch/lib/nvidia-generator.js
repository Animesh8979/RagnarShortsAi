const fetch = require('node-fetch');

/**
 * Generate highly optimized short-form scripts using Nvidia's LLM endpoints.
 * @param {string} prompt - The user prompt/system instruction.
 * @param {string} systemMessage - Optional system message.
 * @returns {Promise<string>} The generated script text.
 */
async function generateNvidiaScript(prompt, systemMessage = "You are an expert short-form video scriptwriter.") {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not defined in the environment.");
  }

  // Use a fast reasoning model hosted on Nvidia's inference API
  const model = "meta/llama-3.1-70b-instruct"; 

  const payload = {
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1024,
  };

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Nvidia API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (data && data.choices && data.choices.length > 0) {
    return data.choices[0].message.content.trim();
  }

  throw new Error("Invalid response format from Nvidia API");
}

module.exports = { generateNvidiaScript };
