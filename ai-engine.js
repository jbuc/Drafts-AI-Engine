/**
 * ai-engine.js - Drafts AI Engine
 *
 * A multi-provider AI library for use in Agile Tortoise's Drafts app.
 * Place this file in Drafts/Library/Scripts in iCloud.
 *
 * Usage: require('ai-engine.js');   // aiEngine is available globally after this
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
 *   aiEngine.callAI({ provider: 'openai', endpoint: "https://api.openai.com/v1", model: "gpt-4o" }, params, onSuccess, onError);
 */

// Everything is wrapped in an IIFE so helpers are guaranteed closure variables,
// not top-level declarations that may be scoped away by Drafts' eval environment.
var aiEngine = (function () {

    // ---------------------------------------------------------------------------
    // Pre-defined model registry
    // ---------------------------------------------------------------------------

    var MODELS = {
        // AlterHQ — routing proxy (model field: "Provider#model-id")
        'alter-openai-4o':        { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'OpenAI#gpt-4o'                      },
        'alter-openai-4o-mini':   { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'OpenAI#gpt-4o-mini'                 },
        'alter-openai-o1':        { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'OpenAI#o1'                          },
        'alter-openai-o3':        { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'OpenAI#o3'                          },
        'alter-openai-o3-mini':   { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'OpenAI#o3-mini'                     },
        'alter-claude-opus':      { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Claude#Claude-3-Opus-20240229'       },
        'alter-claude-sonnet':    { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Claude#Claude-3-5-Sonnet-20240620'   },
        'alter-claude-37-sonnet': { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Claude#Claude-3-7-Sonnet-20250219'   },
        'alter-claude-haiku':     { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Claude#Claude-3-5-Haiku-20241022'    },
        'alter-gemini-pro':       { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Gemini#gemini-1.5-pro'              },
        'alter-gemini-15-flash':  { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Gemini#gemini-1.5-flash'            },
        'alter-gemini-fast':      { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Gemini#gemini-2.0-flash'            },
        'alter-gemini-25-pro':    { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Gemini#gemini-2.5-pro'              },
        'alter-mistral-large':    { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Mistral#mistral-large-latest'        },
        'alter-mistral-small':    { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Mistral#mistral-small-latest'        },
        'alter-codestral':        { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Mistral#codestral-latest'            },
        'alter-pixtral':          { provider: 'alter', endpoint: 'https://alterhq.com/api/v1', model: 'Mistral#pixtral-large-latest'        },

        // Anthropic — direct API (uses Drafts built-in AnthropicAI class)
        'anthropic-opus':     { provider: 'anthropic', endpoint: 'https://api.anthropic.com', model: 'claude-opus-4-6'              },
        'anthropic-sonnet':   { provider: 'anthropic', endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-6'            },
        'anthropic-haiku':    { provider: 'anthropic', endpoint: 'https://api.anthropic.com', model: 'claude-haiku-4-5-20251001'    },

        // OpenAI — direct API (uses Drafts built-in OpenAI class)
        'openai-5-mini':      { provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o'      },
        'openai-5-nano':      { provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },

        // Ollama — local inference, no API key needed
        'ollama-llama3':      { provider: 'ollama', endpoint: 'http://localhost:11434', model: 'llama3'   },
        'ollama-mistral':     { provider: 'ollama', endpoint: 'http://localhost:11434', model: 'mistral'  },
    };

    // ---------------------------------------------------------------------------
    // Prompt assembly
    // ---------------------------------------------------------------------------

    function buildSystemPrompt(params) {
        var sections = [
            ['Role',          params.role],
            ['Goal',          params.goal],
            ['Instructions',  params.steps],
            ['Output Format', params.output],
            ['Example',       params.example],
        ];
        var parts = [];
        for (var i = 0; i < sections.length; i++) {
            var label = sections[i][0];
            var value = sections[i][1];
            if (value && value.trim()) {
                parts.push('# ' + label + '\n' + value.trim());
            }
        }
        return parts.join('\n\n');
    }

    // ---------------------------------------------------------------------------
    // Credential management (used by AlterHQ)
    // ---------------------------------------------------------------------------

    function getApiKey(providerKey, providerDisplayName) {
        var cred = Credential.create(providerKey, providerDisplayName + ' API Key');
        cred.addTextField('api_key', providerDisplayName + ' API Key');
        if (!cred.authorize()) { return null; }
        return cred.getValue('api_key');
    }

    // ---------------------------------------------------------------------------
    // HTTP helper (used by AlterHQ and Ollama)
    // ---------------------------------------------------------------------------

    function httpPost(url, headers, body) {
        var http = HTTP.create();
        return http.request({ url: url, method: 'POST', headers: headers, data: body });
    }

    // ---------------------------------------------------------------------------
    // AlterHQ — OpenAI-compatible routing proxy
    // ---------------------------------------------------------------------------

    function callAlter(providerConfig, params, onSuccess, onError) {
        var apiKey = getApiKey('AlterHQ', 'AlterHQ');
        if (!apiKey) { onError('AlterHQ: failed to retrieve API key.'); return; }

        var baseUrl = (providerConfig.endpoint || 'https://alterhq.com/api').replace(/\/$/, '');
        var model   = providerConfig.model || 'OpenAI#gpt-4o';
        var system  = buildSystemPrompt(params);

        var response = httpPost(
            baseUrl + '/chat/completions',
            { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            { model: model, messages: [{ role: 'system', content: system }, { role: 'user', content: params.input || '' }] }
        );

        if (response.success) {
            try {
                var result = JSON.parse(response.responseText);
                onSuccess(result.choices[0].message.content, result);
            } catch (e) {
                onError('AlterHQ: failed to parse response — ' + e);
            }
        } else {
            onError('AlterHQ API error ' + response.statusCode + ': ' + response.responseText);
        }
    }

    // ---------------------------------------------------------------------------
    // OpenAI — direct HTTP, Bearer token via credential store
    // ---------------------------------------------------------------------------

    function callOpenAI(providerConfig, params, onSuccess, onError) {
        var apiKey = getApiKey('OpenAI', 'OpenAI');
        if (!apiKey) { onError('OpenAI: failed to retrieve API key.'); return; }

        var baseUrl = (providerConfig.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
        var model   = providerConfig.model || 'gpt-4o';
        var system  = buildSystemPrompt(params);

        var response = httpPost(
            baseUrl + '/chat/completions',
            { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            { model: model, messages: [{ role: 'system', content: system }, { role: 'user', content: params.input || '' }] }
        );

        if (response.success) {
            try {
                var result = JSON.parse(response.responseText);
                onSuccess(result.choices[0].message.content, result);
            } catch (e) {
                onError('OpenAI: failed to parse response — ' + e);
            }
        } else {
            onError('OpenAI API error ' + response.statusCode + ': ' + response.responseText);
        }
    }

    // ---------------------------------------------------------------------------
    // Anthropic — direct HTTP, x-api-key header via credential store
    // ---------------------------------------------------------------------------

    function callAnthropic(providerConfig, params, onSuccess, onError) {
        var apiKey = getApiKey('Anthropic', 'Anthropic');
        if (!apiKey) { onError('Anthropic: failed to retrieve API key.'); return; }

        var baseUrl = (providerConfig.endpoint || 'https://api.anthropic.com').replace(/\/$/, '');
        var model   = providerConfig.model || 'claude-opus-4-6';
        var system  = buildSystemPrompt(params);

        var response = httpPost(
            baseUrl + '/v1/messages',
            { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            { model: model, max_tokens: 4096, system: system, messages: [{ role: 'user', content: params.input || '' }] }
        );

        if (response.success) {
            try {
                var result = JSON.parse(response.responseText);
                onSuccess(result.content[0].text, result);
            } catch (e) {
                onError('Anthropic: failed to parse response — ' + e);
            }
        } else {
            onError('Anthropic API error ' + response.statusCode + ': ' + response.responseText);
        }
    }

    // ---------------------------------------------------------------------------
    // Ollama — local inference, no API key required
    // ---------------------------------------------------------------------------

    function callOllama(providerConfig, params, onSuccess, onError) {
        var baseUrl = (providerConfig.endpoint || 'http://localhost:11434').replace(/\/$/, '');
        var model   = providerConfig.model || 'llama3';
        var system  = buildSystemPrompt(params);

        var response = httpPost(
            baseUrl + '/api/chat',
            { 'Content-Type': 'application/json' },
            { model: model, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: params.input || '' }] }
        );

        if (response.success) {
            try {
                var result = JSON.parse(response.responseText);
                onSuccess(result.message.content, result);
            } catch (e) {
                onError('Ollama: failed to parse response — ' + e);
            }
        } else {
            onError('Ollama API error ' + response.statusCode + ': ' + response.responseText);
        }
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    var engine = {};
    engine.models = MODELS;
    engine.defaultModel = 'alter-claude-haiku';

    /**
     * callAI — dispatch a prompt to the specified AI provider.
     *
     * @param {string|Object} model         Pre-defined shorthand (e.g. 'alter-gemini-pro') OR
     *                                      a custom config { provider, endpoint, model }.
     * @param {string|Object} [params]      Either a plain string (used as the full input prompt),
     *                                      or a params object with any of:
     *                                        params.input    — the user's prompt text
     *                                        params.role     — system role description
     *                                        params.goal     — high-level goal
     *                                        params.steps    — step-by-step instructions
     *                                        params.output   — output format requirements
     *                                        params.example  — example of desired output
     *                                      Omit entirely to send an empty prompt.
     * @param {Function}      [onSuccess]   Called with (responseText, rawPayload).
     *                                      Default: creates a new Drafts draft with the response.
     * @param {Function}      [onError]     Called with (errorMessage).
     *                                      Default: calls context.fail with the error.
     */
    engine.callAI = function (model, params, onSuccess, onError) {
        // Normalise params: plain string → { input: string }
        if (typeof params === 'string') {
            params = { input: params };
        } else if (!params || typeof params !== 'object') {
            params = {};
        }

        // Default callbacks
        if (typeof onSuccess !== 'function') {
            onSuccess = function (responseText) {
                var d = Draft.create();
                d.content = responseText;
                d.update();
            };
        }
        if (typeof onError !== 'function') {
            onError = function (err) {
                context.fail('AI Engine Error: ' + err);
            };
        }

        var providerConfig;

        if (typeof model === 'string') {
            providerConfig = MODELS[model];
            if (!providerConfig) {
                var available = Object.keys(MODELS).join(', ');
                onError('ai-engine: unknown model "' + model + '". Available: ' + available);
                return;
            }
        } else {
            providerConfig = model;
        }

        if (!providerConfig || !providerConfig.provider) {
            onError('ai-engine: config must include a provider field (alter, openai, anthropic, or ollama).');
            return;
        }

        switch (providerConfig.provider) {
            case 'alter':     callAlter(providerConfig, params, onSuccess, onError);     break;
            case 'openai':    callOpenAI(providerConfig, params, onSuccess, onError);    break;
            case 'anthropic': callAnthropic(providerConfig, params, onSuccess, onError); break;
            case 'ollama':    callOllama(providerConfig, params, onSuccess, onError);    break;
            default:
                onError('ai-engine: unrecognised provider "' + providerConfig.provider + '". Use alter, openai, anthropic, or ollama.');
        }
    };

    return engine;

})();
