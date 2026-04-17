import log from './log.js';
import {getWorkspace} from './workspace-registry.js';

const DEFAULT_BASE_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const DEFAULT_MODEL = 'openai';
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Insert Scratch blocks tool definition.
 */
const INSERT_BLOCKS_TOOL = {
    type: 'function',
    function: {
        name: 'insertScratchBlocks',
        description: 'Insert Scratch block code directly onto the canvas. Call this when the user asks you to create or modify Scratch code. The blocks appear immediately without requiring user confirmation.',
        parameters: {
            type: 'object',
            properties: {
                xml: {
                    type: 'string',
                    description: 'The Scratch block XML wrapped in <xml>...</xml> tags. Use valid Scratch 3.0 block opcodes. Set x and y attributes on top-level blocks for positioning.'
                },
                explanation: {
                    type: 'string',
                    description: 'A brief text explanation shown to the user describing what the code does.'
                }
            },
            required: ['xml', 'explanation']
        }
    }
};

/**
 * Delete Scratch blocks tool definition.
 */
const DELETE_BLOCKS_TOOL = {
    type: 'function',
    function: {
        name: 'deleteScratchBlocks',
        description: 'Delete all currently visible Scratch blocks from the canvas. Use this when the user asks to clear the canvas or remove code.',
        parameters: {
            type: 'object',
            properties: {
                confirmation: {
                    type: 'string',
                    description: 'A message confirming what was deleted, shown to the user.'
                }
            },
            required: ['confirmation']
        }
    }
};

/**
 * System prompt for the AI assistant.
 */
const SYSTEM_PROMPT = `You are a Scratch code assistant. Help users create Scratch projects by generating Scratch block XML.

RULES:
- ONLY use block types listed below. Never invent block types.
- Use <value name="..."> for inputs, <next> for sequential blocks, <field name="..."> for dropdowns.
- Set x/y on top-level blocks: x="50" y="50", increment x by 250 per additional script.
- Keep explanations VERY short (1-2 sentences). Only explain what the code does.
- When asked to create code, call insertScratchBlocks tool directly. Do NOT output XML as text.
- Respond in the same language the user uses.

BLOCK TYPES:
Motion: motion_movesteps(STEPS), motion_turnright(DEGREES), motion_turnleft(DEGREES), motion_pointindirection(DIRECTION), motion_pointtowards(TOWARDS), motion_gotoxy(X,Y), motion_goto(TO), motion_glidesecstoxy(SECS,X,Y), motion_glideto(SECS,TO), motion_changexby(DX), motion_setx(X), motion_changeyby(DY), motion_sety(Y), motion_ifonedgebounce, motion_setrotationstyle(STYLE:left-right|don't rotate|all around), motion_xposition, motion_yposition, motion_direction
Looks: looks_sayforsecs(MESSAGE,SECS), looks_say(MESSAGE), looks_thinkforsecs(MESSAGE,SECS), looks_think(MESSAGE), looks_show, looks_hide, looks_changeeffectby(EFFECT:COLOR|FISHEYE|WHIRL|PIXELATE|MOSAIC|BRIGHTNESS|GHOST,CHANGE), looks_seteffectto(EFFECT,VALUE), looks_cleargraphiceffects, looks_changesizeby(CHANGE), looks_setsizeto(SIZE), looks_size, looks_switchcostumeto(COSTUME), looks_nextcostume, looks_switchbackdropto(BACKDROP), looks_switchbackdroptoandwait(BACKDROP), looks_nextbackdrop, looks_gotofrontback(FRONT_BACK:front|back), looks_goforwardbackwardlayers(FORWARD_BACKWARD:forward|backward,NUM), looks_backdropnumbername(NUMBER_NAME:number|name), looks_costumenumbername(NUMBER_NAME:number|name)
Sound: sound_play(SOUND_MENU), sound_playuntildone(SOUND_MENU), sound_stopallsounds, sound_changeeffectby(EFFECT:PITCH|PAN,VALUE), sound_seteffectto(EFFECT,VALUE), sound_cleareffects, sound_changevolumeby(VOLUME), sound_setvolumeto(VOLUME), sound_volume
Events: event_whenflagclicked, event_whenkeypressed(KEY_OPTION:space|up arrow|down arrow|left arrow|right arrow|any|a-z|0-9), event_whenthisspriteclicked, event_whenstageclicked, event_whengreaterthan(WHEN:LOUDNESS|TIMER,VALUE), event_whenbroadcastreceived, event_broadcast(BROADCAST_INPUT), event_broadcastandwait(BROADCAST_INPUT)
Control: control_forever(SUBSTACK), control_repeat(TIMES,SUBSTACK), control_if(CONDITION,SUBSTACK), control_if_else(CONDITION,SUBSTACK,SUBSTACK2), control_stop(STOP:all|this script|other scripts in sprite), control_wait(DURATION), control_wait_until(CONDITION), control_repeat_until(CONDITION,SUBSTACK), control_start_as_clone, control_create_clone_of(CLONE_OPTION), control_delete_this_clone
Sensing: sensing_touchingobject(TOUCHINGOBJECTMENU), sensing_touchingcolor(COLOR), sensing_coloristouchingcolor(COLOR,COLOR2), sensing_distanceto(DISTANCETOMENU), sensing_askandwait(QUESTION), sensing_answer, sensing_keypressed(KEY_OPTION), sensing_mousedown, sensing_mousex, sensing_mousey, sensing_setdragmode(DRAG_MODE:draggable|not draggable), sensing_loudness, sensing_timer, sensing_resettimer, sensing_current(CURRENT:YEAR|MONTH|DATE|DAYOFWEEK|HOUR|MINUTE|SECOND), sensing_dayssince2000, sensing_online, sensing_username
Operators: operator_add(NUM1,NUM2), operator_subtract(NUM1,NUM2), operator_multiply(NUM1,NUM2), operator_divide(NUM1,NUM2), operator_random(FROM,TO), operator_gt(OPERAND1,OPERAND2), operator_lt(OPERAND1,OPERAND2), operator_equals(OPERAND1,OPERAND2), operator_and(OPERAND1,OPERAND2), operator_or(OPERAND1,OPERAND2), operator_not(OPERAND), operator_join(STRING1,STRING2), operator_letter_of(LETTER,STRING), operator_length(STRING), operator_contains(STRING1,STRING2), operator_mod(NUM1,NUM2), operator_round(NUM), operator_mathop(OP:abs|floor|ceiling|sqrt|sin|cos|tan|asin|acos|atan|ln|log|e^|10^,NUM)
Variables: data_setvariableto(VARIABLE,VALUE), data_changevariableby(VARIABLE,VALUE), data_showvariable(VARIABLE), data_hidevariable(VARIABLE)
Lists: data_addtolist(ITEM,LIST), data_deleteoflist(INDEX,LIST), data_deletealloflist(LIST), data_insertatlist(ITEM,INDEX,LIST), data_replaceitemoflist(INDEX,ITEM,LIST), data_itemoflist(INDEX,LIST), data_itemnumoflist(ITEM,LIST), data_lengthoflist(LIST), data_listcontainsitem(LIST,ITEM), data_showlist(LIST), data_hidelist(LIST)`;

/**
 * Parse a full XML DOM string and return the top-level block XML strings and count.
 * @param {string} xmlString - The full XML string
 * @returns {{blocks: string[], count: number}}
 */
function parseXmlBlocks (xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const blocks = [];
    for (const child of doc.documentElement.childNodes) {
        if (child.nodeType === 1) {
            blocks.push(new XMLSerializer().serializeToString(child));
        }
    }
    return { blocks, count: blocks.length };
}

/**
 * Send a chat message to an OpenAI-compatible API with SSE streaming.
 * Supports tool call loop for auto-insertion.
 * @param {Array<object>} messages - Array of {role, content, name?, tool_call_id?, tool_calls?} messages
 * @param {object} config - API config: {baseUrl, apiKey, model}
 * @param {object} [options] - Optional: {onChunk: (text, reasoning) => void} for streaming callbacks
 * @returns {Promise<{text: string, xmlBlocks: string|null, toolUsed: string|null, reasoning: string}>}
 */
export async function chat (messages, config, options = {}) {
    const allMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
    ];

    const baseUrl = (config && config.baseUrl) || DEFAULT_BASE_URL;
    const model = (config && config.model) || DEFAULT_MODEL;
    const apiKey = (config && config.apiKey) || '';

    // Ensure URL ends with /chat/completions (OpenAI-compatible endpoint)
    let fetchUrl = baseUrl;
    if (!fetchUrl.includes('/chat/completions')) {
        fetchUrl = fetchUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    // In development, proxy all API requests through webpack-dev-server to avoid CORS
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
        fetchUrl = `/api/ai/${encodeURIComponent(fetchUrl)}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
        const response = await fetch(fetchUrl, {
            method: 'POST',
            cache: 'no-store',
            headers,
            body: JSON.stringify({
                model,
                messages: allMessages,
                tools: [INSERT_BLOCKS_TOOL, DELETE_BLOCKS_TOOL],
                tool_choice: 'auto',
                stream: true
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API error: ${response.status} ${errorText}`);
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let reasoning = '';
        let toolCalls = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const choice = parsed.choices?.[0];
                    if (!choice) continue;

                    const delta = choice.delta;
                    if (!delta) continue;

                    // Accumulate reasoning content (chain of thought)
                    if (delta.reasoning_content) {
                        reasoning += delta.reasoning_content;
                    }

                    // Accumulate text content
                    if (delta.content) {
                        fullText += delta.content;
                    }

                    // Accumulate tool calls (streaming format with index)
                    if (delta.tool_calls) {
                        if (!toolCalls) toolCalls = [];
                        for (const tc of delta.tool_calls) {
                            if (tc.index !== undefined) {
                                if (!toolCalls[tc.index]) {
                                    toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                }
                                const existing = toolCalls[tc.index];
                                if (tc.id) existing.id += tc.id;
                                if (tc.function?.name) existing.function.name += tc.function.name;
                                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                            }
                        }
                    }

                    // Streaming callback
                    if (options.onChunk) {
                        options.onChunk(fullText, reasoning);
                    }
                } catch (parseErr) {
                    // skip malformed SSE lines
                }
            }
        }

        clearTimeout(timeout);

        let result = { text: fullText, xmlBlocks: null, toolUsed: null, reasoning };

        // Process tool calls
        if (toolCalls && toolCalls.length > 0) {
            const toolCall = toolCalls[0];
            if (toolCall.function) {
                result.toolUsed = toolCall.function.name;

                if (toolCall.function.name === 'insertScratchBlocks') {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        result.text = args.explanation || fullText;
                        result.xmlBlocks = args.xml || null;
                    } catch (e) {
                        result.text = fullText;
                    }
                } else if (toolCall.function.name === 'deleteScratchBlocks') {
                    const deletedCount = deleteAllBlocks();
                    result.text = `Deleted ${deletedCount} blocks from the canvas.`;
                }
            }
        } else if (fullText) {
            // Fallback: check for XML in plain text
            const xmlMatch = fullText.match(/```(?:xml)?\s*<xml[\s\S]*?<\/xml>\s*```/);
            if (xmlMatch) {
                result.xmlBlocks = xmlMatch[0];
            }
        }

        return result;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
        }
        throw err;
    }
}

/**
 * Delete all top-level blocks from the workspace.
 * @returns {number} Number of blocks deleted
 */
export function deleteAllBlocks () {
    const workspace = getWorkspace();
    if (!workspace) return 0;

    const allBlocks = workspace.getAllBlocks(false);
    const count = allBlocks.length;
    workspace.clear();
    return count;
}

export default { chat, deleteAllBlocks };
