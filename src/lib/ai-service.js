import log from './log.js';
import {getWorkspace} from './workspace-registry.js';

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
 * Send a chat message to the AI API using tool calling.
 * Supports tool call loop for auto-insertion.
 * @param {Array<object>} messages - Array of {role, content, name?, tool_call_id?, tool_calls?} messages
 * @param {object} config - API config: {baseUrl, apiKey, model}
 * @returns {Promise<{text: string, xmlBlocks: string|null, toolUsed: string|null}>}
 */
export async function chat (messages, config) {
    const allMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
    ];

    let baseUrl;
    if (process.env.NODE_ENV !== 'production' && config.baseUrl === 'https://coding.dashscope.aliyuncs.com/v1') {
        // Development: use webpack dev server proxy
        baseUrl = '/api/ai';
    } else if (config.baseUrl === 'https://coding.dashscope.aliyuncs.com/v1' ||
               config.baseUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1') {
        // Production DashScope: use compatible-mode endpoint which supports CORS
        baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    } else {
        baseUrl = config.baseUrl;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: allMessages,
            tools: [INSERT_BLOCKS_TOOL, DELETE_BLOCKS_TOOL],
            tool_choice: 'auto',
            stream: false
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('AI API returned an empty or malformed response (no choices)');
    }

    const choice = data.choices[0];
    if (!choice.message) {
        throw new Error('AI API returned a malformed response (no message)');
    }

    const message = choice.message;
    let result = { text: '', xmlBlocks: null, toolUsed: null };

    // Check if the model called a tool
    if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        if (toolCall.function) {
            result.toolUsed = toolCall.function.name;

            if (toolCall.function.name === 'insertScratchBlocks') {
                const args = JSON.parse(toolCall.function.arguments);
                result.text = args.explanation || '';
                result.xmlBlocks = args.xml || null;
            } else if (toolCall.function.name === 'deleteScratchBlocks') {
                const args = JSON.parse(toolCall.function.arguments);
                result.text = args.confirmation || '';
                // Execute deletion directly
                const deletedCount = deleteAllBlocks();
                result.text = args.confirmation || `Deleted ${deletedCount} blocks from the canvas.`;
            }
        }
    } else if (typeof message.content === 'string') {
        // Fallback: model returned plain text
        result.text = message.content;
        const xmlMatch = message.content.match(/```(?:xml)?\s*<xml[\s\S]*?<\/xml>\s*```/);
        if (xmlMatch) {
            result.xmlBlocks = xmlMatch[0];
        }
    }

    return result;
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
