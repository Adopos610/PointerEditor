import PropTypes from 'prop-types';
import classNames from 'classnames';
import React from 'react';
import Box from '../box/box.jsx';
import WorkspaceBackgroundPicker from './workspace-background-picker.jsx';
import {
    getWorkspaceBackground,
    getWorkspaceBackgroundStyle,
    getWorkspacePanelStyle,
    isDarkBackground
} from '../../lib/pointer-workspace-background';
import styles from './blocks.css';

class BlocksComponent extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            background: getWorkspaceBackground()
        };
        this.handleBackgroundChanged = this.handleBackgroundChanged.bind(this);
    }

    componentDidMount () {
        window.addEventListener('pointere-workspace-background-changed', this.handleBackgroundChanged);
    }

    componentWillUnmount () {
        window.removeEventListener('pointere-workspace-background-changed', this.handleBackgroundChanged);
    }

    handleBackgroundChanged (event) {
        this.setState({
            background: event && event.detail ? event.detail : getWorkspaceBackground()
        });
    }

    render () {
        const {
            containerRef,
            dragOver,
            style,
            ...componentProps
        } = this.props;
        const background = this.state.background;
        const panelStyle = {...getWorkspacePanelStyle(background), ...style};
        const darkControls = isDarkBackground(background);
        return (
            <div
                className={classNames(styles.blocksWrap, {
                    [styles.darkControls]: darkControls
                })}
                style={panelStyle}
            >
                <div
                    className={styles.workspaceBackground}
                    style={getWorkspaceBackgroundStyle(background)}
                />
                <Box
                    className={classNames(styles.blocks, {
                        [styles.dragOver]: dragOver
                    })}
                    {...componentProps}
                    componentRef={containerRef}
                />
                <WorkspaceBackgroundPicker settings={background} />
            </div>
        );
    }
}

BlocksComponent.propTypes = {
    containerRef: PropTypes.func,
    dragOver: PropTypes.bool,
    style: PropTypes.object
};

export default BlocksComponent;
