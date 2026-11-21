import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import {
    WORKSPACE_BACKGROUND_PRESETS,
    getWorkspaceBackgroundStyle,
    isDarkBackground,
    isDarkColor,
    setWorkspaceBackground
} from '../../lib/pointer-workspace-background';
import styles from './workspace-background-picker.css';

class WorkspaceBackgroundPicker extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            open: false,
            message: ''
        };
        this.pickerRef = null;
        this.fileInput = null;
        this.setPickerRef = this.setPickerRef.bind(this);
        this.setFileInput = this.setFileInput.bind(this);
        this.handleToggle = this.handleToggle.bind(this);
        this.handleOutsideClick = this.handleOutsideClick.bind(this);
        this.handlePreset = this.handlePreset.bind(this);
        this.handleColor = this.handleColor.bind(this);
        this.handleChooseFile = this.handleChooseFile.bind(this);
        this.handleClearImage = this.handleClearImage.bind(this);
        this.handleFileChange = this.handleFileChange.bind(this);
        this.handleBackgroundBlur = this.handleBackgroundBlur.bind(this);
        this.handlePanelBlur = this.handlePanelBlur.bind(this);
        this.handlePanelOpacity = this.handlePanelOpacity.bind(this);
        this.handleReset = this.handleReset.bind(this);
    }

    componentDidMount () {
        document.addEventListener('mousedown', this.handleOutsideClick, true);
    }

    componentWillUnmount () {
        document.removeEventListener('mousedown', this.handleOutsideClick, true);
    }

    setPickerRef (element) {
        this.pickerRef = element;
    }

    setFileInput (element) {
        this.fileInput = element;
    }

    handleOutsideClick (event) {
        if (!this.state.open || !this.pickerRef) return;
        if (this.pickerRef.contains(event.target)) return;
        this.setState({open: false});
    }

    handleToggle () {
        this.setState(previous => ({open: !previous.open, message: ''}));
    }

    apply (patch) {
        this.setState({message: ''});
        setWorkspaceBackground(patch);
    }

    handlePreset (preset) {
        this.apply({preset: preset.id, color: '', image: '', dark: Boolean(preset.dark)});
    }

    handleColor (event) {
        this.apply({
            preset: 'color',
            color: event.target.value,
            image: '',
            dark: isDarkColor(event.target.value)
        });
    }

    handleChooseFile () {
        if (this.fileInput) this.fileInput.click();
    }

    handleClearImage () {
        this.apply({preset: 'default', image: '', color: '', dark: false});
    }

    handleBackgroundBlur (event) {
        this.apply({backgroundBlur: Number(event.target.value)});
    }

    handlePanelBlur (event) {
        this.apply({panelBlur: Number(event.target.value)});
    }

    handlePanelOpacity (event) {
        this.apply({panelOpacity: Number(event.target.value) / 100});
    }

    handleReset () {
        this.setState({message: ''});
        setWorkspaceBackground({
            preset: 'default',
            color: '',
            image: '',
            dark: false,
            backgroundBlur: 0,
            panelBlur: 14,
            panelOpacity: 0.55
        });
    }

    handleFileChange (event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            this.setState({message: '请选择图片文件'});
            return;
        }
        this.setState({message: '正在处理图片…'});
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const maxWidth = 1600;
                const maxHeight = 1000;
                const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const context = canvas.getContext('2d');
                if (!context) {
                    this.setState({message: '图片处理失败'});
                    return;
                }
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                let dark = false;
                try {
                    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                    let total = 0;
                    let samples = 0;
                    const step = 4 * 24;
                    for (let index = 0; index < pixels.length; index += step) {
                        total += (0.2126 * pixels[index]) +
                            (0.7152 * pixels[index + 1]) +
                            (0.0722 * pixels[index + 2]);
                        samples += 1;
                    }
                    dark = samples > 0 && (total / samples) < 128;
                } catch (error) {
                    dark = false;
                }
                let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                if (dataUrl.length > 2.2 * 1024 * 1024) {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.68);
                }
                if (dataUrl.length > 2.8 * 1024 * 1024) {
                    this.setState({message: '图片太大，请换一张'});
                    return;
                }
                const persisted = setWorkspaceBackground({
                    preset: 'image',
                    image: dataUrl,
                    color: '',
                    dark
                });
                this.setState({message: persisted ? '' : '图片已应用，但无法长期保存'});
            };
            image.onerror = () => this.setState({message: '图片读取失败'});
            image.src = reader.result;
        };
        reader.onerror = () => this.setState({message: '图片读取失败'});
        reader.readAsDataURL(file);
    }

    render () {
        const {settings} = this.props;
        const {open, message} = this.state;
        const activePreset = settings.image ? 'image' : (settings.color ? 'color' : settings.preset);
        const triggerStyle = getWorkspaceBackgroundStyle(settings);
        const dark = isDarkBackground(settings);
        return (
            <div
                className={classNames(styles.picker, {
                    [styles.dark]: dark
                })}
                ref={this.setPickerRef}
            >
                <button
                    className={styles.trigger}
                    type="button"
                    onClick={this.handleToggle}
                    aria-expanded={open}
                    title="自定义工作区背景"
                >
                    <span
                        className={styles.triggerDot}
                        style={{
                            backgroundColor: triggerStyle.backgroundColor,
                            backgroundImage: triggerStyle.backgroundImage,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }}
                    />
                    背景
                </button>
                {open ? (
                    <div
                        className={styles.panel}
                        role="dialog"
                        aria-label="工作区背景"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <div className={styles.head}>
                            <strong>工作区背景</strong>
                            <button
                                className={styles.close}
                                type="button"
                                onClick={this.handleToggle}
                                aria-label="关闭背景设置"
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.sectionTitle}>预设</div>
                        <div className={styles.presetGrid}>
                            {WORKSPACE_BACKGROUND_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    className={classNames(styles.preset, {
                                        [styles.presetActive]: activePreset === preset.id
                                    })}
                                    type="button"
                                    onClick={() => this.handlePreset(preset)}
                                >
                                    <span
                                        className={styles.presetSwatch}
                                        style={{background: preset.id === 'default' ? '#fff' : preset.css}}
                                    />
                                    <span>{preset.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className={styles.sectionTitle}>自定义</div>
                        <label className={styles.row}>
                            <span>纯色背景</span>
                            <input
                                className={styles.colorInput}
                                type="color"
                                value={settings.color || '#ffffff'}
                                onChange={this.handleColor}
                            />
                        </label>
                        <div className={styles.row}>
                            <span>背景图片</span>
                            <div className={styles.rowActions}>
                                <button
                                    className={styles.smallButton}
                                    type="button"
                                    onClick={this.handleChooseFile}
                                >
                                    上传图片
                                </button>
                                {settings.image ? (
                                    <button
                                        className={styles.smallButton}
                                        type="button"
                                        onClick={this.handleClearImage}
                                    >
                                        清除
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <input
                            className={styles.fileInput}
                            id="workspace-background-file"
                            ref={this.setFileInput}
                            type="file"
                            accept="image/*"
                            onChange={this.handleFileChange}
                        />

                        <div className={styles.sectionTitle}>面板</div>
                        <label className={styles.sliderRow}>
                            <span>背景模糊</span>
                            <input
                                className={styles.slider}
                                type="range"
                                min="0"
                                max="16"
                                step="1"
                                value={settings.backgroundBlur}
                                onChange={this.handleBackgroundBlur}
                            />
                            <span>{settings.backgroundBlur}px</span>
                        </label>
                        <label className={styles.sliderRow}>
                            <span>面板模糊</span>
                            <input
                                className={styles.slider}
                                type="range"
                                min="0"
                                max="24"
                                step="1"
                                value={settings.panelBlur}
                                onChange={this.handlePanelBlur}
                            />
                            <span>{settings.panelBlur}px</span>
                        </label>
                        <label className={styles.sliderRow}>
                            <span>面板透明度</span>
                            <input
                                className={styles.slider}
                                type="range"
                                min="30"
                                max="95"
                                step="1"
                                value={Math.round(settings.panelOpacity * 100)}
                                onChange={this.handlePanelOpacity}
                            />
                            <span>{Math.round(settings.panelOpacity * 100)}%</span>
                        </label>

                        {message ? <div className={styles.message}>{message}</div> : null}
                        <button
                            className={styles.reset}
                            type="button"
                            onClick={this.handleReset}
                        >
                            恢复默认
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }
}

WorkspaceBackgroundPicker.propTypes = {
    settings: PropTypes.shape({
        preset: PropTypes.string.isRequired,
        color: PropTypes.string,
        image: PropTypes.string,
        dark: PropTypes.bool,
        backgroundBlur: PropTypes.number.isRequired,
        panelBlur: PropTypes.number.isRequired,
        panelOpacity: PropTypes.number.isRequired
    }).isRequired
};

export default WorkspaceBackgroundPicker;
