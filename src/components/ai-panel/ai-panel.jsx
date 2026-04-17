import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useRef, useEffect, useState} from 'react';
import {FormattedMessage, injectIntl, intlShape} from 'react-intl';

import styles from './ai-panel.css';

/**
 * Simple markdown-to-HTML converter (avoids webpack issues with marked library)
 * Supports: headings, bold, italic, code, inline code, lists, links, line breaks
 */
const simpleMarkdown = (() => {
    const rules = [
        // Code blocks (indented 4 spaces or fenced)
        { regex: /^```(\w*)\n([\s\S]*?)```/gm, replace: (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>` },
        // Headings
        { regex: /^#{1,6}\s+(.+)$/gm, replace: (_, text) => `<strong>${text}</strong>` },
        // Bold + Italic
        { regex: /\*\*\*(.+?)\*\*\*/g, replace: '<strong><em>$1</em></strong>' },
        // Bold
        { regex: /\*\*(.+?)\*\*/g, replace: '<strong>$1</strong>' },
        { regex: /__(.+?)__/g, replace: '<strong>$1</strong>' },
        // Italic
        { regex: /\*(.+?)\*/g, replace: '<em>$1</em>' },
        { regex: /_(.+?)_/g, replace: '<em>$1</em>' },
        // Inline code
        { regex: /`([^`]+)`/g, replace: '<code>$1</code>' },
        // Links
        { regex: /\[([^\]]+)\]\(([^)]+)\)/g, replace: '<a href="$2" target="_blank" rel="noopener">$1</a>' },
        // Unordered list items
        { regex: /^[\s]*[-*+]\s+(.+)$/gm, replace: '<li>$1</li>' },
        // Line breaks (double newline = paragraph, single = br)
        { regex: /\n{2,}/g, replace: '</p><p>' },
        { regex: /\n/g, replace: '<br/>' }
    ];

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return function (text) {
        if (!text) return '';
        let html = text;
        // Protect code blocks first
        const codeBlocks = [];
        html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_, lang, code) => {
            const idx = codeBlocks.length;
            codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
            return `%%CODE_${idx}%%`;
        });
        // Escape HTML in non-code sections
        html = html.replace(/^(?!%%CODE_)[\s\S]+$/gm, line => {
            if (line.startsWith('%%CODE_')) return line;
            return escapeHtml(line);
        });
        // Apply rules
        for (const rule of rules) {
            if (rule.regex.source.startsWith('```')) continue; // skip code block rule
            html = html.replace(rule.regex, rule.replace);
        }
        // Restore code blocks
        html = html.replace(/%%CODE_(\d+)%%/g, (_, i) => codeBlocks[parseInt(i)]);
        // Wrap in paragraph
        return `<p>${html}</p>`;
    };
})();

const AiPanel = ({
    messages,
    loading,
    error,
    config,
    onSendMessage,
    onClearChat,
    onClose,
    onInsertCode,
    onConfigSave,
    intl
}) => {
    const [input, setInput] = useState('');
    const [showConfig, setShowConfig] = useState(false);
    const [tempConfig, setTempConfig] = useState({...config});
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, loading]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed || loading) return;
        setInput('');
        onSendMessage(trimmed);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleConfigSubmit = (e) => {
        e.preventDefault();
        onConfigSave(tempConfig);
        setShowConfig(false);
    };

    const handleConfigChange = (key, value) => {
        setTempConfig(prev => ({ ...prev, [key]: value }));
    };

    const formatMessage = (content) => {
        try {
            return { __html: simpleMarkdown(content || '') };
        } catch {
            return { __html: content || '' };
        }
    };

    const renderMessageContent = (msg) => {
        if (msg.role === 'user') {
            return msg.content;
        }

        // Assistant message with markdown
        const parts = [];

        // If there's a displayText (which may be the explanation from tool call)
        if (msg.displayText) {
            parts.push(
                <div
                    key="text"
                    className={styles.messageText}
                    dangerouslySetInnerHTML={formatMessage(msg.displayText)}
                />
            );
        }

        // Show injection status
        if (msg.toolUsed === 'insertScratchBlocks') {
            if (msg.injectedCount > 0) {
                parts.push(
                    <div key="injected" className={styles.messageSuccess}>
                        <FormattedMessage
                            defaultMessage="Code inserted ({count} blocks)"
                            description="Confirmation that AI code was inserted"
                            id="gui.aiPanel.codeInserted"
                            values={{ count: msg.injectedCount }}
                        />
                    </div>
                );
            } else {
                parts.push(
                    <div key="injected-fail" className={styles.messageWarning}>
                        <FormattedMessage
                            defaultMessage="Code insertion failed"
                            description="Warning that AI code insertion failed"
                            id="gui.aiPanel.codeInsertFailed"
                        />
                    </div>
                );
            }
        }

        if (msg.toolUsed === 'deleteScratchBlocks') {
            parts.push(
                <div key="deleted" className={styles.messageSuccess}>
                    <FormattedMessage
                        defaultMessage="Blocks deleted from canvas"
                        description="Confirmation that blocks were deleted"
                        id="gui.aiPanel.blocksDeleted"
                    />
                </div>
            );
        }

        // Manual insert button (fallback for messages without toolUsed)
        if (msg.xmlBlocks && !msg.toolUsed) {
            parts.push(
                <div key="actions" className={styles.messageActions}>
                    <button
                        className={styles.insertCodeBtn}
                        onClick={() => onInsertCode(msg.xmlBlocks)}
                    >
                        <FormattedMessage
                            defaultMessage="Insert Code"
                            description="Button to insert AI-generated code"
                            id="gui.aiPanel.insertCode"
                        />
                    </button>
                </div>
            );
        }

        return parts;
    };

    return (
        <div className={styles.aiPanelWrapper}>
            <div className={styles.aiPanelHeader}>
                <div className={styles.aiPanelTitle}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M8 1L9.5 5.5L14 4L10.5 7.5L14 11L9.5 9.5L8 14L6.5 9.5L2 11L5.5 7.5L2 4L6.5 5.5L8 1Z"
                            fill="currentColor"
                        />
                    </svg>
                    <FormattedMessage
                        defaultMessage="AI Assistant"
                        description="AI panel header title"
                        id="gui.aiPanel.title"
                    />
                </div>
                <div className={styles.aiPanelHeaderActions}>
                    {messages.length > 0 && (
                        <button
                            className={styles.aiPanelHeaderBtn}
                            onClick={onClearChat}
                            title={intl.formatMessage({
                                defaultMessage: 'Clear chat',
                                description: 'Tooltip for clear chat button',
                                id: 'gui.aiPanel.clearChatTooltip'
                            })}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 4l-1.5 16a2 2 0 01-2 2H8.5a2 2 0 01-2-2L5 4" />
                                <line x1="9" y1="14" x2="9.01" y2="14" />
                                <line x1="15" y1="14" x2="15.01" y2="14" />
                            </svg>
                        </button>
                    )}
                    <button
                        className={classNames(styles.aiPanelHeaderBtn, showConfig && styles.aiPanelHeaderBtnActive)}
                        onClick={() => setShowConfig(!showConfig)}
                        title={intl.formatMessage({
                            defaultMessage: 'Settings',
                            description: 'Tooltip for settings button',
                            id: 'gui.aiPanel.settings'
                        })}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                    </button>
                    <button
                        className={styles.aiPanelClose}
                        onClick={onClose}
                        aria-label={intl.formatMessage({
                            defaultMessage: 'Close AI panel',
                            description: 'Aria label for close button',
                            id: 'gui.aiPanel.closeAria'
                        })}
                    >
                        &times;
                    </button>
                </div>
            </div>

            {/* Config panel */}
            {showConfig && (
                <form className={styles.aiConfigPanel} onSubmit={handleConfigSubmit}>
                    <div className={styles.aiConfigField}>
                        <label>
                            <FormattedMessage
                                defaultMessage="API Base URL"
                                description="Label for API base URL config"
                                id="gui.aiPanel.apiBaseUrl"
                            />
                        </label>
                        <input
                            type="text"
                            value={tempConfig.baseUrl}
                            onChange={e => handleConfigChange('baseUrl', e.target.value)}
                            placeholder="https://coding.dashscope.aliyuncs.com/v1"
                        />
                    </div>
                    <div className={styles.aiConfigField}>
                        <label>
                            <FormattedMessage
                                defaultMessage="API Key"
                                description="Label for API key config"
                                id="gui.aiPanel.apiKey"
                            />
                        </label>
                        <input
                            type="password"
                            value={tempConfig.apiKey}
                            onChange={e => handleConfigChange('apiKey', e.target.value)}
                            placeholder="sk-..."
                        />
                    </div>
                    <div className={styles.aiConfigField}>
                        <label>
                            <FormattedMessage
                                defaultMessage="Model"
                                description="Label for model config"
                                id="gui.aiPanel.model"
                            />
                        </label>
                        <input
                            type="text"
                            value={tempConfig.model}
                            onChange={e => handleConfigChange('model', e.target.value)}
                            placeholder="qwen3.6-plus"
                        />
                    </div>
                    <div className={styles.aiConfigActions}>
                        <button type="submit" className={styles.aiConfigSaveBtn}>
                            <FormattedMessage
                                defaultMessage="Save"
                                description="Save config button"
                                id="gui.aiPanel.saveConfig"
                            />
                        </button>
                        <button
                            type="button"
                            className={styles.aiConfigCancelBtn}
                            onClick={() => setShowConfig(false)}
                        >
                            <FormattedMessage
                                defaultMessage="Cancel"
                                description="Cancel config button"
                                id="gui.aiPanel.cancelConfig"
                            />
                        </button>
                    </div>
                </form>
            )}

            {/* Messages */}
            <div className={styles.aiMessages}>
                {messages.length === 0 && !loading && (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                                <path
                                    d="M20 5L23 13L31 11L25 17L31 23L23 21L20 29L17 21L9 23L15 17L9 11L17 13L20 5Z"
                                    fill="currentColor"
                                />
                            </svg>
                        </div>
                        <div>
                            <FormattedMessage
                                defaultMessage="Ask me to create Scratch code!"
                                description="AI panel empty state message"
                                id="gui.aiPanel.emptyState"
                            />
                        </div>
                    </div>
                )}

                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={classNames(
                            styles.message,
                            msg.role === 'user' ? styles.messageUser : styles.messageAi
                        )}
                    >
                        {renderMessageContent(msg)}
                    </div>
                ))}

                {loading && (
                    <div className={styles.loadingIndicator}>
                        <div className={styles.spinner} />
                        <FormattedMessage
                            defaultMessage="Thinking..."
                            description="AI loading message"
                            id="gui.aiPanel.loading"
                        />
                    </div>
                )}

                {error && (
                    <div className={styles.aiError}>
                        <FormattedMessage
                            defaultMessage="Error: {error}"
                            description="Error display"
                            id="gui.aiPanel.error"
                            values={{ error }}
                        />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={styles.aiInputArea}>
                <textarea
                    ref={textareaRef}
                    className={styles.aiTextarea}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={intl.formatMessage({
                        defaultMessage: 'Describe what you want to build... (Enter to send, Shift+Enter for newline)',
                        description: 'Input placeholder',
                        id: 'gui.aiPanel.placeholder'
                    })}
                    rows={2}
                    disabled={loading}
                />
                <button
                    className={classNames(styles.aiSendBtn)}
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                >
                    <FormattedMessage
                        defaultMessage="Send"
                        description="AI send button"
                        id="gui.aiPanel.send"
                    />
                </button>
            </div>
        </div>
    );
};

AiPanel.propTypes = {
    config: PropTypes.shape({
        baseUrl: PropTypes.string,
        apiKey: PropTypes.string,
        model: PropTypes.string
    }),
    error: PropTypes.string,
    loading: PropTypes.bool,
    messages: PropTypes.arrayOf(
        PropTypes.shape({
            role: PropTypes.oneOf(['user', 'assistant', 'tool']).isRequired,
            content: PropTypes.string,
            displayText: PropTypes.string,
            xmlBlocks: PropTypes.string,
            toolUsed: PropTypes.string,
            injectedCount: PropTypes.number,
            injectedBlockXml: PropTypes.array
        })
    ),
    onClearChat: PropTypes.func,
    onClose: PropTypes.func,
    onConfigSave: PropTypes.func,
    onInsertCode: PropTypes.func,
    onSendMessage: PropTypes.func,
    intl: intlShape.isRequired
};

AiPanel.defaultProps = {
    config: { baseUrl: '', apiKey: '', model: '' },
    messages: [],
    loading: false,
    error: null,
    onClearChat: () => {},
    onClose: () => {},
    onConfigSave: () => {},
    onInsertCode: () => {},
    onSendMessage: () => {}
};

export default injectIntl(AiPanel);
