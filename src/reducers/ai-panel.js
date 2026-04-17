const TOGGLE_AI_PANEL = 'TOGGLE_AI_PANEL';
const SET_MESSAGES = 'SET_MESSAGES';
const SET_LOADING = 'SET_LOADING';
const SET_ERROR = 'SET_ERROR';
const CLEAR_CHAT = 'CLEAR_CHAT';
const LOAD_CONFIG = 'LOAD_CONFIG';
const SAVE_CONFIG = 'SAVE_CONFIG';
const LOAD_HISTORY = 'LOAD_HISTORY';
const SAVE_HISTORY = 'SAVE_HISTORY';

const STORAGE_KEY_CONFIG = 'scratch_ai_config';
const STORAGE_KEY_HISTORY = 'scratch_ai_history';

const defaultConfig = {
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    apiKey: '',
    model: 'qwen3.6-plus'
};

function loadConfig () {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (raw) return { ...defaultConfig, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...defaultConfig };
}

function loadHistory () {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
}

function persistConfig (cfg) {
    try { localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg)); } catch { /* ignore */ }
}

function persistHistory (msgs) {
    try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(msgs)); } catch { /* ignore */ }
}

const savedConfig = loadConfig();
const savedHistory = loadHistory();

const initialState = {
    visible: false,
    messages: savedHistory,
    loading: false,
    error: null,
    config: savedConfig
};

const aiPanelReducer = (state = initialState, action) => {
    switch (action.type) {
    case TOGGLE_AI_PANEL:
        return { ...state, visible: !state.visible };
    case SET_MESSAGES: {
        const messages = action.messages;
        persistHistory(messages);
        return { ...state, messages, error: null };
    }
    case SET_LOADING:
        return { ...state, loading: action.loading };
    case SET_ERROR:
        return { ...state, error: action.error };
    case CLEAR_CHAT: {
        persistHistory([]);
        return { ...state, messages: [], error: null };
    }
    case SAVE_CONFIG: {
        const config = { ...state.config, ...action.config };
        persistConfig(config);
        return { ...state, config };
    }
    default:
        return state;
    }
};

export {
    aiPanelReducer as default,
    initialState as aiPanelInitialState,
    TOGGLE_AI_PANEL,
    SET_MESSAGES,
    SET_LOADING,
    SET_ERROR,
    CLEAR_CHAT,
    SAVE_CONFIG,
    persistConfig,
    persistHistory,
    loadConfig,
    loadHistory
};

// Action creators
export function toggleAiPanel () {
    return { type: TOGGLE_AI_PANEL };
}

export function setMessages (messages) {
    return { type: SET_MESSAGES, messages };
}

export function setLoading (loading) {
    return { type: SET_LOADING, loading };
}

export function setError (error) {
    return { type: SET_ERROR, error };
}

export function clearChat () {
    return { type: CLEAR_CHAT };
}

export function saveConfig (config) {
    return { type: SAVE_CONFIG, config };
}
