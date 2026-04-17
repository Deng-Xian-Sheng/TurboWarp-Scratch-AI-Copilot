import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import AiPanelComponent from '../components/ai-panel/ai-panel.jsx';
import {chat, deleteAllBlocks} from '../lib/ai-service.js';
import {
    setMessages, setLoading, setError, clearChat, toggleAiPanel,
    saveConfig, loadConfig, loadHistory
} from '../reducers/ai-panel.js';
import {getWorkspace} from '../lib/workspace-registry.js';
import log from '../lib/log.js';

class AiPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSendMessage',
            'handleInsertCode',
            'handleClearChat',
            'handleClose',
            'handleConfigSave'
        ]);
        this.state = {
            streamingText: '',
            streamingReasoning: ''
        };
    }

    async handleSendMessage (message) {
        const {messages, config, onSetLoading, onSetMessages, onSetError} = this.props;

        // Build user message
        const userMessage = { role: 'user', content: message };
        const updatedMessages = [...messages, userMessage];

        // Add user message immediately
        onSetMessages(updatedMessages.map(m => ({
            ...m,
            displayText: m.content
        })));

        onSetLoading(true);
        this.setState({ streamingText: '', streamingReasoning: '' });

        try {
            // Build API messages (strip display-only fields)
            let apiMessages = updatedMessages.map(m => {
                const apiMsg = { role: m.role, content: m.content };
                if (m.name) apiMsg.name = m.name;
                if (m.tool_call_id) apiMsg.tool_call_id = m.tool_call_id;
                return apiMsg;
            });

            // Call the API with streaming
            const result = await chat(apiMessages, config, {
                onChunk: (text, reasoning) => {
                    // Use setTimeout to ensure React processes each update in its own tick
                    setTimeout(() => {
                        this.setState({ streamingText: text, streamingReasoning: reasoning });
                    }, 0);
                }
            });

            // Build final assistant message
            const assistantMessage = {
                role: 'assistant',
                content: result.text,
                displayText: result.text,
                reasoning: result.reasoning,
                xmlBlocks: result.xmlBlocks,
                toolUsed: result.toolUsed
            };

            // If the model used insertScratchBlocks tool, inject blocks automatically
            if (result.toolUsed === 'insertScratchBlocks' && result.xmlBlocks) {
                const injected = this.injectBlocks(result.xmlBlocks);
                assistantMessage.injectedCount = injected.count;
                assistantMessage.injectedBlockXml = injected.blocks;
            }

            onSetMessages([...updatedMessages, assistantMessage]);
        } catch (err) {
            onSetError(err.message || 'Failed to get AI response');
        } finally {
            onSetLoading(false);
            this.setState({ streamingText: '', streamingReasoning: '' });
        }
    }

    /**
     * Inject XML blocks into the workspace.
     * @param {string} xmlBlocks - XML string
     * @returns {{count: number, blocks: string[]}}
     */
    injectBlocks (xmlBlocks) {
        const workspace = getWorkspace();
        const ScratchBlocks = window.Blockly || window.ScratchBlocks;
        if (!workspace || !xmlBlocks || !ScratchBlocks) {
            log.warn('injectBlocks: missing workspace, xmlBlocks, or ScratchBlocks');
            return { count: 0, blocks: [] };
        }

        try {
            const dom = ScratchBlocks.Xml.textToDom(xmlBlocks);
            const beforeIds = new Set(workspace.getAllBlocks(false).map(b => b.id));

            // Calculate offset based on existing blocks
            const allExisting = workspace.getAllBlocks(false);
            let offsetX = 50;
            let offsetY = 50;
            if (allExisting.length > 0) {
                const lastBlock = allExisting[allExisting.length - 1];
                const xy = lastBlock.getRelativeToSurfaceXY();
                offsetX = xy.x + 100;
                offsetY = Math.max(50, xy.y);
            }

            // Inject each top-level block individually
            let currentX = offsetX;
            let injectedCount = 0;
            for (let i = 0; i < dom.childNodes.length; i++) {
                const child = dom.childNodes[i];
                if (child.nodeType === 1 && child.tagName === 'block') {
                    try {
                        const block = ScratchBlocks.Xml.domToBlock(child, workspace);
                        block.moveBy(currentX, offsetY);
                        currentX += 250;
                        injectedCount++;
                    } catch (blockErr) {
                        log.error('Failed to inject individual block:', blockErr);
                    }
                }
            }

            const newBlocks = workspace.getAllBlocks(false).filter(b => !beforeIds.has(b.id));
            log.info(`AI blocks injected: ${newBlocks.length} blocks`);
            return { count: newBlocks.length, blocks: newBlocks.map(b => b.id) };
        } catch (err) {
            log.error('Failed to inject AI blocks:', err);
            return { count: 0, blocks: [] };
        }
    }

    handleInsertCode (xmlBlocks) {
        this.injectBlocks(xmlBlocks);
    }

    handleClearChat () {
        this.props.onClearChat();
    }

    handleClose () {
        this.props.onClose();
    }

    handleConfigSave (config) {
        this.props.onSaveConfig(config);
    }

    render () {
        const { messages, loading, error, config } = this.props;
        const { streamingText, streamingReasoning } = this.state;
        return (
            <AiPanelComponent
                config={config}
                error={error}
                loading={loading}
                messages={messages}
                streamingText={streamingText}
                streamingReasoning={streamingReasoning}
                onClearChat={this.handleClearChat}
                onClose={this.handleClose}
                onConfigSave={this.handleConfigSave}
                onInsertCode={this.handleInsertCode}
                onSendMessage={this.handleSendMessage}
            />
        );
    }
}

AiPanel.propTypes = {
    config: PropTypes.shape({
        baseUrl: PropTypes.string,
        apiKey: PropTypes.string,
        model: PropTypes.string
    }),
    error: PropTypes.string,
    loading: PropTypes.bool,
    messages: PropTypes.array,
    onClearChat: PropTypes.func,
    onClose: PropTypes.func,
    onConfigSave: PropTypes.func,
    onSetError: PropTypes.func,
    onSetLoading: PropTypes.func,
    onSetMessages: PropTypes.func
};

const mapStateToProps = state => ({
    config: state.scratchGui.aiPanel.config,
    messages: state.scratchGui.aiPanel.messages,
    loading: state.scratchGui.aiPanel.loading,
    error: state.scratchGui.aiPanel.error
});

const mapDispatchToProps = dispatch => ({
    onSetMessages: messages => dispatch(setMessages(messages)),
    onSetLoading: loading => dispatch(setLoading(loading)),
    onSetError: error => dispatch(setError(error)),
    onClearChat: () => dispatch(clearChat()),
    onClose: () => dispatch(toggleAiPanel()),
    onSaveConfig: config => dispatch(saveConfig(config))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(AiPanel);
