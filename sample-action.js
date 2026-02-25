/**
 * sample-action.js
 *
 * Paste any of the examples below into a Drafts "Script" action step.
 * Make sure ai-engine.js lives in Drafts/Library/Scripts in iCloud first.
 *
 * Each example is self-contained — pick one, delete the rest.
 */

require('ai-engine.js');

// ─── CHOOSE YOUR MODEL ────────────────────────────────────────────────────────
// Swap this one line to change the model for any example below.
// Full list: ai-engine.models  (alter-*, anthropic-*, openai-*, ollama-*)
var MODEL = aiEngine.defaultModel; // 'alter-claude-haiku'


// =============================================================================
// EXAMPLE 1 — Simplest possible call
// Sends the current draft to the AI; creates a NEW draft with the response.
// =============================================================================
aiEngine.callAI(MODEL, draft.content);


// =============================================================================
// EXAMPLE 2 — Replace the current draft with the AI response
// Good for: rewriting, reformatting, cleaning up notes.
// =============================================================================
aiEngine.callAI(MODEL, draft.content, 'replace');


// =============================================================================
// EXAMPLE 3 — Append the AI response to the current draft
// Good for: adding a summary, tags, or next-steps below your notes.
// =============================================================================
aiEngine.callAI(MODEL, draft.content, 'append');


// =============================================================================
// EXAMPLE 4 — Prepend the AI response to the current draft
// Good for: adding a generated title or intro above your notes.
// =============================================================================
aiEngine.callAI(MODEL, draft.content, 'prepend');


// =============================================================================
// EXAMPLE 5 — Set template tokens for follow-up action steps
// Sets [[ai_title]] (first line, max 80 chars) and [[ai_content]] (full response).
// Use those tags in any step that runs after this script step.
// =============================================================================
aiEngine.callAI(MODEL, draft.content, 'tokens');


// =============================================================================
// EXAMPLE 6 — Structured prompt (role / goal / steps / output)
// Use a params object to build a proper system prompt instead of a raw string.
// =============================================================================
aiEngine.callAI(MODEL, {
    role:   'You are a professional editor who specialises in clear, concise prose.',
    goal:   'Improve the writing quality of the text supplied by the user.',
    steps:  '1. Fix grammar and spelling.\n2. Remove filler words.\n3. Preserve the author\'s voice.',
    output: 'Return only the revised text. No commentary, no preamble.',
    input:  draft.content,
}, 'replace');


// =============================================================================
// EXAMPLE 7 — Structured prompt with a keyword + custom error handler
// Good for: adding your own error UI (e.g. an alert) instead of context.fail.
// =============================================================================
aiEngine.callAI(MODEL, {
    role:   'You are a tagging assistant for a personal knowledge base.',
    goal:   'Generate a short list of tags that describe the main topics of the note.',
    output: 'Return only the tags as a single line, comma-separated, lowercase, no # symbols.',
    input:  draft.content,
}, 'append', function (err) {
    alert('AI error: ' + err);
    context.fail(err);
});


// =============================================================================
// EXAMPLE 8 — Custom success handler (full control over what happens)
// The callback receives (responseText, rawAPIPayload).
// =============================================================================
aiEngine.callAI(MODEL, draft.content, function (responseText, raw) {
    // Do anything you like with the response.
    var newDraft = Draft.create();
    newDraft.content  = responseText;
    newDraft.addTag('ai-generated');
    newDraft.update();
    editor.load(newDraft); // open it immediately
});


// =============================================================================
// EXAMPLE 9 — Custom model config (a model not in the built-in list)
// Pass a { provider, endpoint, model } object instead of a shorthand string.
// =============================================================================
aiEngine.callAI(
    { provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' },
    draft.content,
    'new'
);

// Ollama (local, no API key):
aiEngine.callAI(
    { provider: 'ollama', endpoint: 'http://localhost:11434', model: 'phi3' },
    draft.content,
    'replace'
);


// =============================================================================
// EXAMPLE 10 — Two-step pipeline using 'tokens'
// Step 1 (this script): generate content and store it in template tags.
// Step 2 (a later action step, e.g. "Create Draft" or another script):
//   use [[ai_content]] and [[ai_title]] as template variables.
// =============================================================================
aiEngine.callAI(MODEL, {
    role:   'You are a blog post writer.',
    goal:   'Write a short blog post based on the user\'s rough notes.',
    output: 'Begin with a compelling title on the first line, then a blank line, then the post body.',
    input:  draft.content,
}, 'tokens');
// After this step, [[ai_title]] holds the first line of the response,
// and [[ai_content]] holds the full post — ready for any follow-up action step.


// =============================================================================
// EXAMPLE 11 — Auto-sanitize PII before every cloud call (global flag)
// Set once at the top of your script; all callAI calls will scrub input
// automatically. Emails, phones, SSNs, card numbers, and IPs are replaced
// with labelled placeholders like [EMAIL], [PHONE], [SSN], [CARD], [IP].
// Ollama (local) is never sanitized — only cloud providers are affected.
// =============================================================================
aiEngine.sanitizePII = true; // flip this flag on and all cloud calls are scrubbed
aiEngine.callAI(MODEL, draft.content, 'new');


// =============================================================================
// EXAMPLE 12 — Sanitize a specific string on demand (without the global flag)
// Useful if you want fine-grained control over what gets scrubbed.
// =============================================================================
var clean = aiEngine.sanitize(draft.content);
aiEngine.callAI(MODEL, clean, 'new');


// =============================================================================
// EXAMPLE 13 — Add a custom PII pattern (e.g. internal employee IDs)
// Push any { pattern, replacement } object onto engine.piiPatterns.
// The pattern runs alongside the built-in ones whenever sanitizePII is true
// or aiEngine.sanitize() is called directly.
// =============================================================================
aiEngine.piiPatterns.push({
    pattern:     /\bEMP-\d{5,8}\b/gi,
    replacement: '[EMPLOYEE_ID]',
});
aiEngine.sanitizePII = true;
aiEngine.callAI(MODEL, draft.content, 'new');
