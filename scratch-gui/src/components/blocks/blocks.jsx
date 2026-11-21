import PropTypes from 'prop-types';
import classNames from 'classnames';
import React from 'react';
import Box from '../box/box.jsx';
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
            theme,
            ...componentProps
        } = this.props;
        const background = this.state.background;
        const themeDark = Boolean(theme && theme.isDark && theme.isDark());
        const dark = themeDark || isDarkBackground(background);
        const panelStyle = {...getWorkspacePanelStyle(background, dark), ...style};
        return (
            <div
                className={classNames(styles.blocksWrap, {
                    [styles.darkControls]: dark
                })}
                style={panelStyle}
            >
                <div
                    className={styles.workspaceBackground}
                    style={getWorkspaceBackgroundStyle(background, themeDark)}
                />
                <Box
                    className={classNames(styles.blocks, {
                        [styles.dragOver]: dragOver
                    })}
                    {...componentProps}
                    componentRef={containerRef}
                />
            </div>
        );
    }
}

BlocksComponent.propTypes = {
    containerRef: PropTypes.func,
    dragOver: PropTypes.bool,
    style: PropTypes.object,
    theme: PropTypes.shape({
        isDark: PropTypes.func
    })
};

export default BlocksComponent;
