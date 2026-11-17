import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useEffect, useRef, useState} from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import SecurityModals from '../../lib/tw-security-manager-constants';
import {analyzeExtension, analyzeExtensionWithAgent} from '../../lib/pointer-security';
import {isPeAgentAvailable} from '../../lib/pointer-peagent';
import LoadExtensionModal from './load-extension.jsx';
import FetchModal from './fetch.jsx';
import OpenWindowModal from './open-window.jsx';
import RedirectModal from './redirect.jsx';
import RecordAudio from './record-audio.jsx';
import RecordVideo from './record-video.jsx';
import ReadClipboard from './read-clipboard.jsx';
import Notify from './notify.jsx';
import Geolocate from './geolocate.jsx';
import Embed from './embed.jsx';
import Download from './download.jsx';
import DelayedMountPropertyHOC from './delayed-mount-property-hoc.jsx';
import styles from './security-manager-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Extension Security',
        // eslint-disable-next-line max-len
        description: 'Title of modal thats asks the user for permission to let the project load an extension, fetch a resource, open a window, etc.',
        id: 'tw.securityManager.title'
    }
});

const noop = () => {};

const levelLabels = {
    danger: '风险较高',
    caution: '需要留意',
    safe: '未发现明显风险'
};

const levelClasses = {
    danger: styles.analysisDanger,
    caution: styles.analysisCaution,
    safe: styles.analysisSafe
};

const findingLevelText = {
    high: '高风险',
    medium: '留意',
    good: '可信'
};

const dotClasses = {
    high: styles.dotHigh,
    medium: styles.dotMedium,
    good: styles.dotGood
};

const SecurityManagerModalComponent = props => {
    const [analysis, setAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiConsent, setAiConsent] = useState(false);
    const aiPanelRef = useRef(null);
    const canAnalyze = props.type === SecurityModals.LoadExtension;
    const agentAvailable = isPeAgentAvailable();

    useEffect(() => {
        if (aiResult && aiPanelRef.current) {
            aiPanelRef.current.scrollIntoView({block: 'nearest', behavior: 'smooth'});
        }
    }, [aiResult]);

    const handleAnalyze = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        setAiResult(null);
        setAiError('');
        setAiConsent(false);
        try {
            const result = await analyzeExtension(props.data.url, {
                unsandboxed: Boolean(props.data.unsandboxed)
            });
            setAnalysis(result);
        } catch (error) {
            setAnalysis({
                level: 'caution',
                score: 0,
                summary: `分析失败：${error.message}`,
                findings: [],
                sourceScanned: false,
                sourceText: ''
            });
        } finally {
            setAnalyzing(false);
        }
    };

    const handleAiAnalyze = async () => {
        if (aiBusy || !aiConsent || !analysis) return;
        setAiBusy(true);
        setAiError('');
        try {
            const result = await analyzeExtensionWithAgent(analysis.sourceText, {
                url: props.data.url,
                level: analysis.level,
                score: analysis.score
            });
            if (result.ok) setAiResult(result);
            else setAiError(result.error || 'AI 深度分析失败');
        } catch (error) {
            setAiError(error.message);
        } finally {
            setAiBusy(false);
        }
    };

    const renderAiResult = () => {
        if (!aiResult) return null;
        return (
            <div ref={aiPanelRef} className={`${styles.aiPanel} ${levelClasses[aiResult.level] || ''}`}>
                <div className={styles.analysisHeader}>
                    <span className={styles.analysisBadge}>
                        AI · {levelLabels[aiResult.level] || '分析结果'}
                    </span>
                    <span className={styles.analysisScore}>
                        {aiResult.unparsed ? '文字结论' : `风险指数 ${aiResult.score}/100`}
                    </span>
                </div>
                <p className={styles.analysisSummary}>{aiResult.summary}</p>
                {aiResult.findings.length ? (
                    <ul className={styles.analysisList}>
                        {aiResult.findings.map((item, index) => (
                            <li key={`${item.title}-${index}`} className={styles.analysisItem}>
                                <span className={`${styles.analysisDot} ${dotClasses[item.level] || ''}`} />
                                <div>
                                    <strong>
                                        {item.title}
                                        <em className={styles.analysisLevel}>
                                            {findingLevelText[item.level] || ''}
                                        </em>
                                    </strong>
                                    <p>{item.detail}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <p className={styles.analysisFoot}>
                    由 {aiResult.model || '你配置的模型'} 分析；源码直接发送到你的模型接口，不经过 PointerE 服务器。
                </p>
            </div>
        );
    };

    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.enableButtons ? props.onDenied : noop}
            contentLabel={props.intl.formatMessage(messages.title)}
            id="securitymanagermodal"
        >
            <Box className={styles.body}>
                {props.type === SecurityModals.LoadExtension ? (
                    <LoadExtensionModal {...props.data} />
                ) : props.type === SecurityModals.Fetch ? (
                    <FetchModal {...props.data} />
                ) : props.type === SecurityModals.OpenWindow ? (
                    <OpenWindowModal {...props.data} />
                ) : props.type === SecurityModals.Redirect ? (
                    <RedirectModal {...props.data} />
                ) : props.type === SecurityModals.RecordAudio ? (
                    <RecordAudio {...props.data} />
                ) : props.type === SecurityModals.RecordVideo ? (
                    <RecordVideo {...props.data} />
                ) : props.type === SecurityModals.ReadClipboard ? (
                    <ReadClipboard {...props.data} />
                ) : props.type === SecurityModals.Notify ? (
                    <Notify {...props.data} />
                ) : props.type === SecurityModals.Geolocate ? (
                    <Geolocate {...props.data} />
                ) : props.type === SecurityModals.Embed ? (
                    <Embed {...props.data} />
                ) : props.type === SecurityModals.Download ? (
                    <Download {...props.data} />
                ) : null}

                {canAnalyze && (
                    <div className={styles.analysis}>
                        <button
                            type="button"
                            className={styles.analyzeButton}
                            onClick={handleAnalyze}
                            disabled={analyzing || !props.enableButtons}
                        >
                            <span className={styles.analyzeIcon}>✦</span>
                            {analyzing ? '正在分析链接与源码…' : '智能分析'}
                        </button>
                        {analysis && (
                            <React.Fragment>
                            <div className={`${styles.analysisPanel} ${levelClasses[analysis.level] || ''}`}>
                                <div className={styles.analysisHeader}>
                                    <span className={styles.analysisBadge}>
                                        {levelLabels[analysis.level] || '分析结果'}
                                    </span>
                                    <span className={styles.analysisScore}>
                                        风险指数 {analysis.score}/100
                                    </span>
                                </div>
                                <p className={styles.analysisSummary}>{analysis.summary}</p>
                                {analysis.findings.length ? (
                                    <ul className={styles.analysisList}>
                                        {analysis.findings.map((item, index) => (
                                            <li key={`${item.title}-${index}`} className={styles.analysisItem}>
                                                <span className={`${styles.analysisDot} ${dotClasses[item.level] || ''}`} />
                                                <div>
                                                    <strong>
                                                        {item.title}
                                                        {item.count > 1 ? ` ×${item.count}` : ''}
                                                        <em className={styles.analysisLevel}>
                                                            {findingLevelText[item.level] || ''}
                                                        </em>
                                                    </strong>
                                                    <p>{item.detail}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className={styles.analysisEmpty}>没有扫描到可识别的风险特征。</p>
                                )}
                                <p className={styles.analysisFoot}>
                                    {analysis.sourceScanned ?
                                        '已在本地完成源码静态扫描，代码不会上传到服务器。' :
                                        '仅完成链接与域名分析，未能读取远程源码。'}
                                </p>
                            </div>
                            <div className={styles.aiBlock}>
                                    <div className={styles.aiHead}>
                                        <span className={styles.aiBadge}>AI 深度分析</span>
                                        <span>用真实模型复核可疑行为</span>
                                    </div>
                                    {!agentAvailable ? (
                                        <p className={styles.aiHint}>
                                            桌面版配置 PEAgent 后，可启用 AI 深度分析。
                                        </p>
                                    ) : (!analysis.sourceScanned ? (
                                        <p className={styles.aiHint}>
                                            未能读取源码，无法进行 AI 深度分析。
                                        </p>
                                    ) : (
                                        <React.Fragment>
                                            <label className={styles.aiConsent}>
                                                <input
                                                    type="checkbox"
                                                    checked={aiConsent}
                                                    onChange={e => setAiConsent(e.target.checked)}
                                                />
                                                <span>
                                                    允许适度调用 Agent API：仅将本次扩展源码发送给你已配置的模型做安全审计
                                                </span>
                                            </label>
                                            <button
                                                type="button"
                                                className={styles.aiButton}
                                                onClick={handleAiAnalyze}
                                                disabled={!aiConsent || aiBusy}
                                            >
                                                {aiBusy ? 'AI 正在审计源码…' : '同意并开始 AI 深度分析'}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                    {aiError ? <p className={styles.aiError}>{aiError}</p> : null}
                                    {renderAiResult()}
                                </div>
                            </React.Fragment>
                        )}
                    </div>
                )}

                <Box className={styles.buttons}>
                    <button
                        className={styles.denyButton}
                        onClick={props.onDenied}
                        disabled={!props.enableButtons}
                    >
                        <FormattedMessage
                            defaultMessage="Deny"
                            description="Button in modal asking user for permission to load extension, access file, etc."
                            id="tw.securityManager.deny"
                        />
                    </button>
                    <button
                        className={styles.allowButton}
                        onClick={props.onAllowed}
                        disabled={!props.enableButtons}
                    >
                        <FormattedMessage
                            defaultMessage="Allow"
                            description="Button in modal asking user for permission to load extension, access file, etc."
                            id="tw.securityManager.allow"
                        />
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

SecurityManagerModalComponent.propTypes = {
    intl: intlShape,
    type: PropTypes.oneOf(Object.values(SecurityModals)),
    enableButtons: PropTypes.bool,
    // Each modal may have different type of data
    // eslint-disable-next-line react/forbid-prop-types
    data: PropTypes.object.isRequired,
    onAllowed: PropTypes.func.isRequired,
    onDenied: PropTypes.func.isRequired
};

// Prevent accidentally pressing buttons immediately when a prompt appears.
const BUTTON_DELAY = 750;
export default DelayedMountPropertyHOC(injectIntl(SecurityManagerModalComponent), BUTTON_DELAY, {
    enableButtons: true
});
