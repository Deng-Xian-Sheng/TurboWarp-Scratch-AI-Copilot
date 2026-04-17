import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import log from '../lib/log.js';

const STORAGE_KEY = 'scratch_canvas_autosave';
const SAVE_INTERVAL = 30000; // 30 seconds

const CanvasAutosaveHOC = function (WrappedComponent) {
    class CanvasAutosaveComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleAutoSave',
                'handleVisibilityChange'
            ]);
            this.saveTimer = null;
        }

        componentDidMount () {
            // Start periodic auto-save
            this.saveTimer = setInterval(this.handleAutoSave, SAVE_INTERVAL);

            // Save on visibility change (tab switch)
            document.addEventListener('visibilitychange', this.handleVisibilityChange);

            // Try to restore saved canvas on first load
            this.tryRestoreCanvas();
        }

        componentWillUnmount () {
            if (this.saveTimer) {
                clearInterval(this.saveTimer);
            }
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }

        handleVisibilityChange () {
            if (document.hidden) {
                this.handleAutoSave();
            }
        }

        handleAutoSave () {
            const vm = this.props.vm;
            if (!vm) return;

            try {
                const state = vm.toJSON();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                log.info('Canvas auto-saved to localStorage');
            } catch (e) {
                log.warn('Canvas auto-save failed:', e.message);
            }
        }

        async tryRestoreCanvas () {
            const vm = this.props.vm;
            if (!vm) return;

            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (!saved) return;

                const state = JSON.parse(saved);
                await vm.loadProject(state);
                log.info('Canvas restored from localStorage');
            } catch (e) {
                log.warn('Canvas restore failed:', e.message);
                // Silently fail - let the default project load
            }
        }

        render () {
            const {
                /* eslint-disable no-unused-vars */
                vm,
                /* eslint-enable no-unused-vars */
                ...componentProps
            } = this.props;

            return (
                <WrappedComponent
                    {...componentProps}
                />
            );
        }
    }

    CanvasAutosaveComponent.propTypes = {
        vm: PropTypes.instanceOf(VM)
    };

    const mapStateToProps = state => ({
        vm: state.scratchGui.vm
    });

    return connect(mapStateToProps)(CanvasAutosaveComponent);
};

export default CanvasAutosaveHOC;
