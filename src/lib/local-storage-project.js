const STORAGE_KEY = 'scratch_local_project';

/**
 * Save project JSON to localStorage.
 * @param {object} vmState - VM.toJSON() output
 */
export function saveProject (vmState) {
    try {
        localStorage.setItem(STORAGE_KEY, vmState);
    } catch { /* ignore - storage full or unavailable */ }
}

/**
 * Load project from localStorage.
 * @returns {string|null} - JSON string or null
 */
export function loadProject () {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Check if a saved project exists in localStorage.
 * @returns {boolean}
 */
export function hasSavedProject () {
    try {
        return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}

/**
 * Clear the saved project from localStorage.
 */
export function clearProject () {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
}
