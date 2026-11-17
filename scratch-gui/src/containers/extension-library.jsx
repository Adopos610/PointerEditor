import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import log from '../lib/log';

import extensionLibraryContent from '../lib/libraries/extensions/index.jsx';
import {communityExtensions, pointerExtensions} from '../lib/libraries/extensions/pointer-gallery';

import PointerExtensionLibrary from '../components/pointer-extension-library/pointer-extension-library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const BUILTIN_SEARCH_TEXT = {
    music: '音乐 乐器 演奏',
    pen: '画笔 绘制 图章',
    videoSensing: '视频 侦测 摄像头',
    faceSensing: '人脸 侦测 摄像头',
    text2speech: '文字 朗读 语音',
    translate: '翻译 语言',
    makeymakey: 'Makey Makey 电路',
    microbit: 'micro:bit 硬件',
    ev3: 'EV3 乐高',
    wedo2: 'WeDo 乐高',
    boost: 'Boost 乐高',
    gdxfor: 'Force 力 传感器',
    custom_extension: '自定义 网址 文件 加载',
    procedures_enable_return: '自定义积木 返回值'
};

const resolveExtensionURL = url => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    try {
        return new URL(url, window.location.href).href;
    } catch (error) {
        return url;
    }
};

const withSearchText = (item, category) => ({
    ...item,
    category,
    rawURL: item.iconURL || item.rawURL || extensionIcon,
    searchText: [
        item.extensionId,
        item.author,
        typeof item.name === 'string' ? item.name : '',
        typeof item.description === 'string' ? item.description : '',
        BUILTIN_SEARCH_TEXT[item.extensionId] || ''
    ].filter(Boolean).join(' ')
});

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            this.props.onRequestClose();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            this.props.onRequestClose();
            return;
        }

        if (item.disabled) return;

        const url = item.extensionURL ? resolveExtensionURL(item.extensionURL) : extensionId;
        if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
            this.props.onCategorySelected(extensionId);
            this.props.onRequestClose();
        } else {
            this.props.vm.extensionManager.loadExtensionURL(url)
                .then(() => {
                    this.props.onCategorySelected(extensionId);
                    this.props.onRequestClose();
                })
                .catch(err => {
                    log.error(err);
                    // eslint-disable-next-line no-alert
                    alert(err);
                });
        }
    }
    render () {
        const localItems = extensionLibraryContent.map(item => withSearchText(
            item,
            item.extensionId === 'custom_extension' ? 'custom' : 'official'
        ));
        const pointerItems = pointerExtensions.map(item => withSearchText(item, 'pointer'));
        const communityItems = communityExtensions.map(item => withSearchText(item, 'community'));
        const items = pointerItems
            .concat(localItems.filter(item => item.category === 'official'))
            .concat(communityItems)
            .concat(localItems.filter(item => item.category === 'custom'));
        return (
            <PointerExtensionLibrary
                items={items}
                visible={this.props.visible}
                vm={this.props.vm}
                onClose={this.props.onRequestClose}
                onSelect={this.handleItemSelect}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default ExtensionLibrary;
