/**
 * ai-engine.js - Drafts AI Engine
 *
 * A multi-provider AI library for use in Agile Tortoise's Drafts app.
 * Place this file in Drafts/Library/Scripts in iCloud.
 *
 * Usage: aiEngine = require('ai-engine.js');
 *
 * Pass a pre-defined model shorthand string to callAI:
 *
 *   aiEngine.callAI('alter-gemini-pro', params, onSuccess, onError);
 *
 * Available shorthands (see aiEngine.models for the full list):
 *   alter-openai-4o      alter-openai-4o-mini  alter-openai-o1    alter-openai-o3   alter-openai-o3-mini
 *   alter-claude-opus    alter-claude-sonnet   alter-claude-37-sonnet              alter-claude-haiku
 *   alter-gemini-pro     alter-gemini-15-flash alter-gemini-fast  alter-gemini-25-pro
 *   alter-mistral-large  alter-mistral-small   alter-codestral    alter-pixtral
 *   anthropic-opus       anthropic-sonnet      anthropic-haiku
 *   openai-5-mini        openai-5-nano
 *   ollama-llama3        ollama-mistral
 *
 * You can also pass a custom config object if you need a model not in the list:
 *   aiEngine.callAI({ endpoint: "https://api.openai.com/v1", model: "gpt-4o" }, params, onSuccess, onError);
 */

const aiEngine = {};

// ---------------------------------------------------------------------------
// Pre-defined model registry
// Keys are the shorthand strings accepted by callAI.
// ---------------------------------------------------------------------------

const MODELS = {
    // AlterHQ — routing proxy (model field: "Provider#model-id")
    // OpenAI models via AlterHQ
    'alter-openai-4o':        { endpoint: 'https://alterhq.com/api', model: 'OpenAI#gpt-4o'                      },
    'alter-openai-4o-mini':   { endpoint: 'https://alterhq.com/api', model: 'OpenAI#gpt-4o-mini'                 },
    'alter-openai-o1':        { endpoint: 'https://alterhq.com/api', model: 'OpenAI#o1'                          },
    'alter-openai-o3':        { endpoint: 'https://alterhq.com/api', model: 'OpenAI#o3'                          },
    'alter-openai-o3-mini':   { endpoint: 'https://alterhq.com/api', model: 'OpenAI#o3-mini'                     },
    // Claude models via AlterHQ
    'alter-claude-opus':      { endpoint: 'https://alterhq.com/api', model: 'Claude#Claude-3-Opus-20240229'       },
    'alter-claude-sonnet':    { endpoint: 'https://alterhq.com/api', model: 'Claude#Claude-3-5-Sonnet-20240620'   },
    'alter-claude-37-sonnet': { endpoint: 'https://alterhq.com/api', model: 'Claude#Claude-3-7-Sonnet-20250219'   },
    'alter-claude-haiku':     { endpoint: 'https://alterhq.com/api', model: 'Claude#Claude-3-5-Haiku-20241022'    },
    // Gemini models via AlterHQ
    'alter-gemini-pro':       { endpoint: 'https://alterhq.com/api', model: 'Gemini#gemini-1.5-pro'              },
    'alter-gemini-15-flash':  { endpoint: 'https://alterhq.com/api', model: 'Gemini#gemini-1.5-flash'            },
    'alter-gemini-fast':      { endpoint: 'https://alterhq.com/api', model: 'Gemini#gemini-2.0-flash'            },
    'alter-gemini-25-pro':    { endpoint: 'https://alterhq.com/api', model: 'Gemini#gemini-2.5-pro'              },
    // Mistral models via AlterHQ
    'alter-mistral-large':    { endpoint: 'https://alterhq.com/api', model: 'Mistral#mistral-large-latest'        },
    'alter-mistral-small':    { endpoint: 'https://alterhq.com/api', model: 'Mistral#mistral-small-latest'        },
    'alter-codestral':        { endpoint: 'https://alterhq.com/api', model: 'Mistral#codestral-latest'            },
    'alter-pixtral':          { endpoint: 'https://alterhq.com/api', model: 'Mistral#pixtral-large-latest'        },

    // Anthropic — direct API
    'anthropic-opus':     { endpoint: 'https://api.anthropic.com', model: 'claude-opus-4-6'              },
    'anthropic-sonnet':   { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-6'            },
    'anthropic-haiku':    { endpoint: 'https://api.anthropic.com', model: 'claude-haiku-4-5-20251001'    },

    // OpenAI — direct API
    'openai-5-mini':      { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o'                 },
    'openai-5-nano':      { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini'            },

    // Ollama — local inference, no API key needed
    'ollama-llama3':      { endpoint: 'http://localhost:11434', model: 'llama3'   },
    'ollama-mistral':     { endpoint: 'http://localhost:11434', model: 'mistral'  },
};

// Expose the registry so scripts can inspect available shorthands.
aiEngine.models = MODELS;

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
// AlterHQ
// AlterHQ is a routing proxy; the model field encodes provider and model,
// e.g. "Gemini#gemini-1.5-pro" or "OpenAI#gpt-4o".
// The API surface is OpenAI-compatible.
// ---------------------------------------------------------------------------

function callAlter(providerConfig, params, onSuccess, onError) {
    const apiKey = getApiKey('AlterHQ API', 'AlterHQ');
    if (!apiKey) { onError('AlterHQ: failed to retrieve API key.'); return; }

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
            onError(`AlterHQ: failed to parse response — ${e}`);
        }
    } else {
        onError(`AlterHQ API error ${response.statusCode}: ${response.responseText}`);
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
 * @param {string|Object} model             Pre-defined shorthand (e.g. 'alter-gemini-pro') OR
 *                                          a custom config { endpoint, model }.
 * @param {Object}        params            Prompt parameters.
 * @param {string}        [params.role]     System role description.
 * @param {string}        [params.goal]     High-level goal for the AI.
 * @param {string}        [params.steps]    Step-by-step instructions.
 * @param {string}        [params.output]   Output format requirements.
 * @param {string}        [params.example]  An example of desired output.
 * @param {string}        [params.input]    The user's input text.
 * @param {Function}      onSuccess         Called with (responseText, rawPayload).
 * @param {Function}      onError           Called with (errorMessage).
 */
aiEngine.callAI = function(model, params, onSuccess, onError) {
    let providerConfig;

    if (typeof model === 'string') {
        providerConfig = MODELS[model];
        if (!providerConfig) {
            const available = Object.keys(MODELS).join(', ');
            onError(`ai-engine: unknown model "${model}". Available: ${available}`);
            return;
        }
    } else {
        providerConfig = model;
    }

    if (!providerConfig || !providerConfig.endpoint) {
        onError('ai-engine: a valid model shorthand or config object with an endpoint is required.');
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

return aiEngine;
