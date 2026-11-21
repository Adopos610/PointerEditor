import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {injectIntl, intlShape} from 'react-intl';

import {setProjectTitle} from '../../reducers/project-title';
import {setProjectUnchanged} from '../../reducers/project-changed';
import {openRestorePointModal} from '../../reducers/modals';
import PointerProjectTabs from '../menu-bar/pointer-project-tabs.jsx';
import styles from './pointer-project-tab-bar.css';

const PointerProjectTabBar = ({
    canEditTitle,
    intl,
    projectTitle,
    vm,
    onOpenRestorePoints,
    onProjectUnchanged,
    onSetProjectTitle
}) => {
    if (!canEditTitle) return null;
    return (
        <div className={styles.tabBar}>
            <PointerProjectTabs
                intl={intl}
                projectTitle={projectTitle}
                vm={vm}
                onOpenRestorePoints={onOpenRestorePoints}
                onProjectUnchanged={onProjectUnchanged}
                onSetProjectTitle={onSetProjectTitle}
                onTabChange={() => {
                    window.dispatchEvent(new CustomEvent('pointere-active-tab-changed'));
                }}
            />
        </div>
    );
};

PointerProjectTabBar.propTypes = {
    canEditTitle: PropTypes.bool,
    intl: intlShape.isRequired,
    onOpenRestorePoints: PropTypes.func,
    onProjectUnchanged: PropTypes.func,
    onSetProjectTitle: PropTypes.func,
    projectTitle: PropTypes.string,
    vm: PropTypes.object.isRequired
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onOpenRestorePoints: () => dispatch(openRestorePointModal()),
    onProjectUnchanged: () => dispatch(setProjectUnchanged()),
    onSetProjectTitle: title => dispatch(setProjectTitle(title))
});

export default compose(
    injectIntl,
    connect(mapStateToProps, mapDispatchToProps)
)(PointerProjectTabBar);
