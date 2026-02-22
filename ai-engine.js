/**
 * ai-engine.js - Drafts AI Engine
 *
 * A multi-provider AI library for use in Agile Tortoise's Drafts app.
 * Place this file in Drafts/Library/Scripts in iCloud.
 *
 * Usage: aiEngine = require('ai-engine.js');
 *
 * Supported providers: Alter, OpenAI, Anthropic, Ollama
 *
 * Provider configs:
 *   Alter:     { endpoint: "https://alterhq.com/api",        model: "Gemini#gemini-1.5-pro" }
 *   OpenAI:    { endpoint: "https://api.openai.com/v1",      model: "gpt-4o" }
 *   Anthropic: { endpoint: "https://api.anthropic.com",      model: "claude-opus-4-6" }
 *   Ollama:    { endpoint: "http://localhost:11434",          model: "llama3" }
 */

const aiEngine = {};

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

function detectProvider(endpoint) {
    if (!endpoint) return 'unknown';
    const url = endpoint.toLowerCase();
    if (url.includes('alterhq.com'))   return 'alter';
    if (url.includes('openai.com'))    return 'openai';
    if (url.includes('anthropic.com')) return 'anthropic';
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('ollama')) return 'ollama';
    // Treat any other endpoint as OpenAI-compatible
    return 'openai';
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildSystemPrompt(params) {
    const sections = [
        ['Role',          params.role],
        ['Goal',          params.goal],
        ['Instructions',  params.steps],
        ['Output Format', params.output],
        ['Example',       params.example],
    ];

    return sections
        .filter(([, value]) => value && value.trim())
        .map(([label, value]) => `# ${label}\n${value.trim()}`)
        .join('\n\n');
}

// ---------------------------------------------------------------------------
// Credential management
// Drafts stores API keys per-provider; the user is prompted once per provider.
// ---------------------------------------------------------------------------

function getApiKey(providerKey, providerDisplayName) {
    const cred = Credential.create(providerKey, `${providerDisplayName} API Key`);
    cred.addTextField('api_key', `${providerDisplayName} API Key`);

    if (!cred.authorize()) {
        return null;
    }
    return cred.getValue('api_key');
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpPost(url, headers, body) {
    const http = HTTP.create();
    return http.request({
        url: url,
        method: 'POST',
        headers: headers,
        data: body,
    });
}

// ---------------------------------------------------------------------------
// Alter
// Alter is a routing proxy; the model field encodes provider and model,
// e.g. "Gemini#gemini-1.5-pro" or "OpenAI#gpt-4o".
// The API surface is OpenAI-compatible.
// ---------------------------------------------------------------------------

function callAlter(providerConfig, params, onSuccess, onError) {
    const apiKey = getApiKey('alter', 'Alter');
    if (!apiKey) { onError('Alter: failed to retrieve API key.'); return; }

    const baseUrl  = (providerConfig.endpoint || 'https://alterhq.com/api').replace(/\/$/, '');
    const model    = providerConfig.model || 'OpenAI#gpt-4o';
    const system   = buildSystemPrompt(params);

    const payload = {
        model: model,
        messages: [
            { role: 'system', content: system },
            { role: 'user',   content: params.input || '' },
        ],
    };

    const response = httpPost(
        `${baseUrl}/chat/completions`,
        {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        payload
    );

    if (response.success) {
        try {
            const result = JSON.parse(response.responseText);
            onSuccess(result.choices[0].message.content, result);
        } catch (e) {
            onError(`Alter: failed to parse response — ${e}`);
        }
    } else {
        onError(`Alter API error ${response.statusCode}: ${response.responseText}`);
    }
}

// ---------------------------------------------------------------------------
// OpenAI (and OpenAI-compatible endpoints)
// ---------------------------------------------------------------------------

function callOpenAI(providerConfig, params, onSuccess, onError) {
    const apiKey = getApiKey('openai', 'OpenAI');
    if (!apiKey) { onError('OpenAI: failed to retrieve API key.'); return; }

    const baseUrl = (providerConfig.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model   = providerConfig.model || 'gpt-4o';
    const system  = buildSystemPrompt(params);

    const payload = {
        model: model,
        messages: [
            { role: 'system', content: system },
            { role: 'user',   content: params.input || '' },
        ],
    };

    const response = httpPost(
        `${baseUrl}/chat/completions`,
        {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        payload
    );

    if (response.success) {
        try {
            const result = JSON.parse(response.responseText);
            onSuccess(result.choices[0].message.content, result);
        } catch (e) {
            onError(`OpenAI: failed to parse response — ${e}`);
        }
    } else {
        onError(`OpenAI API error ${response.statusCode}: ${response.responseText}`);
    }
}

// ---------------------------------------------------------------------------
// Anthropic (Claude)
// ---------------------------------------------------------------------------

function callAnthropic(providerConfig, params, onSuccess, onError) {
    const apiKey = getApiKey('anthropic', 'Anthropic');
    if (!apiKey) { onError('Anthropic: failed to retrieve API key.'); return; }

    const baseUrl = (providerConfig.endpoint || 'https://api.anthropic.com').replace(/\/$/, '');
    const model   = providerConfig.model || 'claude-opus-4-6';
    const system  = buildSystemPrompt(params);

    const payload = {
        model: model,
        max_tokens: 4096,
        system: system,
        messages: [
            { role: 'user', content: params.input || '' },
        ],
    };

    const response = httpPost(
        `${baseUrl}/v1/messages`,
        {
            'Content-Type':     'application/json',
            'x-api-key':        apiKey,
            'anthropic-version': '2023-06-01',
        },
        payload
    );

    if (response.success) {
        try {
            const result = JSON.parse(response.responseText);
            onSuccess(result.content[0].text, result);
        } catch (e) {
            onError(`Anthropic: failed to parse response — ${e}`);
        }
    } else {
        onError(`Anthropic API error ${response.statusCode}: ${response.responseText}`);
    }
}

// ---------------------------------------------------------------------------
// Ollama (local inference)
// No API key required.
// ---------------------------------------------------------------------------

function callOllama(providerConfig, params, onSuccess, onError) {
    const baseUrl = (providerConfig.endpoint || 'http://localhost:11434').replace(/\/$/, '');
    const model   = providerConfig.model || 'llama3';
    const system  = buildSystemPrompt(params);

    const payload = {
        model: model,
        stream: false,
        messages: [
            { role: 'system', content: system },
            { role: 'user',   content: params.input || '' },
        ],
    };

    const response = httpPost(
        `${baseUrl}/api/chat`,
        { 'Content-Type': 'application/json' },
        payload
    );

    if (response.success) {
        try {
            const result = JSON.parse(response.responseText);
            onSuccess(result.message.content, result);
        } catch (e) {
            onError(`Ollama: failed to parse response — ${e}`);
        }
    } else {
        onError(`Ollama API error ${response.statusCode}: ${response.responseText}`);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * callAI — dispatch a prompt to the specified AI provider.
 *
 * @param {Object}   providerConfig          Provider settings.
 * @param {string}   providerConfig.endpoint Base URL for the provider API.
 * @param {string}   providerConfig.model    Model identifier.
 * @param {Object}   params                  Prompt parameters.
 * @param {string}   [params.role]           System role description.
 * @param {string}   [params.goal]           High-level goal for the AI.
 * @param {string}   [params.steps]          Step-by-step instructions.
 * @param {string}   [params.output]         Output format requirements.
 * @param {string}   [params.example]        An example of desired output.
 * @param {string}   [params.input]          The user's input text.
 * @param {Function} onSuccess               Called with (responseText, rawPayload).
 * @param {Function} onError                 Called with (errorMessage).
 */
aiEngine.callAI = function(providerConfig, params, onSuccess, onError) {
    if (!providerConfig || !providerConfig.endpoint) {
        onError('ai-engine: providerConfig.endpoint is required.');
        return;
    }

    const provider = detectProvider(providerConfig.endpoint);

    switch (provider) {
        case 'alter':
            callAlter(providerConfig, params, onSuccess, onError);
            break;
        case 'openai':
            callOpenAI(providerConfig, params, onSuccess, onError);
            break;
        case 'anthropic':
            callAnthropic(providerConfig, params, onSuccess, onError);
            break;
        case 'ollama':
            callOllama(providerConfig, params, onSuccess, onError);
            break;
        default:
            onError(`ai-engine: unrecognised provider endpoint "${providerConfig.endpoint}".`);
    }
};

module.exports = aiEngine;
