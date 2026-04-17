import log from './log.js';

const STORAGE_KEY = 'scratch_canvas_state';

/**
 * Save current VM state to localStorage.
 * @param {VM} vm - Scratch VM instance
 */
export function saveCanvasState (vm) {
    try {
        const state = vm.toJSON();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        log.info('Canvas state saved to localStorage');
    } catch (e) {
        log.warn('Failed to save canvas state:', e.message);
    }
}

/**
 * Load saved canvas state from localStorage.
 * @param {VM} vm - Scratch VM instance
 * @returns {Promise<boolean>} - true if state was loaded
 */
export function loadCanvasState (vm) {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return Promise.resolve(false);

        const state = JSON.parse(saved);
        return vm.loadProject(state).then(() => {
            log.info('Canvas state loaded from localStorage');
            return true;
        }).catch(e => {
            log.warn('Failed to load canvas state:', e.message);
            return false;
        });
    } catch (e) {
        log.warn('Failed to load canvas state:', e.message);
        return Promise.resolve(false);
    }
}

/**
 * Clear saved canvas state from localStorage.
 */
export function clearCanvasState () {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // ignore
    }
}

/**
 * Check if there is a saved canvas state.
 * @returns {boolean}
 */
export function hasCanvasState () {
    try {
        return !!localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        return false;
    }
}

export default { saveCanvasState, loadCanvasState, clearCanvasState, hasCanvasState };
