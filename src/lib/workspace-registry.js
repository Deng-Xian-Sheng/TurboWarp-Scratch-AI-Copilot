// Simple singleton to share the Blockly workspace reference between components
let workspaceRef = { current: null };
let vmRef = { current: null };
let scratchBlocksRef = { current: null };

export function setWorkspace (ws) {
    workspaceRef.current = ws;
}

export function getWorkspace () {
    return workspaceRef.current;
}

export function setVM (vm) {
    vmRef.current = vm;
}

export function getVM () {
    return vmRef.current;
}

export function setScratchBlocks (sb) {
    scratchBlocksRef.current = sb;
}

export function getScratchBlocks () {
    return scratchBlocksRef.current;
}

export { workspaceRef, vmRef };
