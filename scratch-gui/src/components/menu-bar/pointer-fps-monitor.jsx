import React from 'react';
import styles from './pointer-fps-monitor.css';

const SAMPLE_INTERVAL = 500;
const MAX_SAMPLES = 21600;

const history = [];

const formatTime = timestamp => {
    const date = new Date(timestamp);
    const pad = value => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

class PointerFpsMonitor extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            fps: 0,
            open: false,
            windowSeconds: 60,
            paused: false,
            revision: 0
        };
        this.frames = 0;
        this.lastSample = performance.now();
        this.handleTick = this.handleTick.bind(this);
        this.handleExport = this.handleExport.bind(this);
        this.handleClear = this.handleClear.bind(this);
        this.handleTogglePause = this.handleTogglePause.bind(this);
        this.handleExternalToggle = this.handleExternalToggle.bind(this);
        this.setCanvas = this.setCanvas.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        this.raf = requestAnimationFrame(this.handleTick);
        window.addEventListener('pointere-toggle-fps', this.handleExternalToggle);
    }

    componentWillUnmount () {
        this.mounted = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        window.removeEventListener('pointere-toggle-fps', this.handleExternalToggle);
    }

    handleExternalToggle () {
        this.setState(previous => ({open: !previous.open}));
    }

    componentDidUpdate () {
        if (this.state.open) this.drawCurve();
    }

    handleTick (now) {
        if (!this.mounted) return;
        this.frames += 1;
        const elapsed = now - this.lastSample;
        if (elapsed >= SAMPLE_INTERVAL) {
            if (elapsed < 3000) {
                const fps = Math.max(0, Math.min(999, Math.round(this.frames * 1000 / elapsed)));
                if (!this.state.paused) {
                    history.push({t: Date.now(), fps});
                    if (history.length > MAX_SAMPLES) {
                        history.splice(0, history.length - MAX_SAMPLES);
                    }
                }
                this.setState(previous => ({fps, revision: previous.revision + 1}));
            } else {
                this.setState({fps: 0});
            }
            this.frames = 0;
            this.lastSample = now;
        }
        this.raf = requestAnimationFrame(this.handleTick);
    }

    getVisibleSamples () {
        if (this.state.windowSeconds === 0) return history;
        const cutoff = Date.now() - this.state.windowSeconds * 1000;
        return history.filter(sample => sample.t >= cutoff);
    }

    setCanvas (node) {
        this.canvas = node;
        if (node) this.drawCurve();
    }

    drawCurve () {
        const canvas = this.canvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);

        const background = ctx.createLinearGradient(0, 0, 0, height);
        background.addColorStop(0, 'rgba(240, 247, 255, 0.9)');
        background.addColorStop(1, 'rgba(226, 239, 255, 0.55)');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);

        const samples = this.getVisibleSamples();
        const peak = samples.reduce((max, item) => Math.max(max, item.fps), 60);
        const scaleMax = Math.max(120, Math.ceil(peak / 30) * 30);

        ctx.strokeStyle = 'rgba(120, 160, 220, 0.28)';
        ctx.lineWidth = 1;
        ctx.font = '9px "OPPO Sans", Arial, sans-serif';
        ctx.fillStyle = 'rgba(92, 118, 155, 0.7)';
        [0, 0.25, 0.5, 0.75, 1].forEach(ratio => {
            const y = height - 4 - ratio * (height - 12);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            const value = Math.round(scaleMax * ratio);
            if (ratio > 0) ctx.fillText(String(value), 3, y - 3);
        });

        if (scaleMax >= 60) {
            const y60 = height - 4 - (60 / scaleMax) * (height - 12);
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(239, 159, 62, 0.55)';
            ctx.beginPath();
            ctx.moveTo(0, y60);
            ctx.lineTo(width, y60);
            ctx.stroke();
            ctx.restore();
        }

        if (samples.length < 2) {
            ctx.fillStyle = 'rgba(84, 118, 168, 0.75)';
            ctx.font = '11px "OPPO Sans", Arial, sans-serif';
            ctx.fillText('正在采集 FPS 数据…', 10, height / 2);
            return;
        }

        const left = 2;
        const right = width - 2;
        const top = 4;
        const bottom = height - 4;
        const xAt = index => left + (index / (samples.length - 1)) * (right - left);
        const yAt = fps => bottom - Math.min(1, fps / scaleMax) * (bottom - top);

        ctx.beginPath();
        ctx.moveTo(xAt(0), bottom);
        samples.forEach((sample, index) => {
            ctx.lineTo(xAt(index), yAt(sample.fps));
        });
        ctx.lineTo(xAt(samples.length - 1), bottom);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, top, 0, bottom);
        fill.addColorStop(0, 'rgba(79, 141, 247, 0.38)');
        fill.addColorStop(1, 'rgba(79, 141, 247, 0.02)');
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.beginPath();
        samples.forEach((sample, index) => {
            const x = xAt(index);
            const y = yAt(sample.fps);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.stroke();

        const last = samples[samples.length - 1];
        ctx.beginPath();
        ctx.arc(xAt(samples.length - 1), yAt(last.fps), 2.8, 0, Math.PI * 2);
        ctx.fillStyle = '#1d4ed8';
        ctx.fill();
    }

    getStats () {
        const samples = this.getVisibleSamples();
        if (!samples.length) return {avg: 0, min: 0, max: 0, drops: 0};
        let total = 0;
        let min = Infinity;
        let max = 0;
        let drops = 0;
        samples.forEach(sample => {
            total += sample.fps;
            min = Math.min(min, sample.fps);
            max = Math.max(max, sample.fps);
            if (sample.fps < 50) drops += 1;
        });
        return {
            avg: Math.round(total / samples.length),
            min,
            max,
            drops
        };
    }

    handleExport () {
        if (!history.length) return;
        const rows = ['时间,FPS'];
        history.forEach(sample => {
            rows.push(`${new Date(sample.t).toISOString()},${sample.fps}`);
        });
        const blob = new Blob([`\ufeff${rows.join('\n')}`], {type: 'text/csv;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pointereditor-fps-${formatTime(Date.now()).replace(/:/g, '')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    handleClear () {
        history.length = 0;
        this.frames = 0;
        this.lastSample = performance.now();
        this.setState(previous => ({fps: 0, revision: previous.revision + 1}));
    }

    handleTogglePause () {
        this.setState(previous => ({paused: !previous.paused}));
    }

    renderPanel () {
        const {windowSeconds, paused, fps} = this.state;
        const stats = this.getStats();
        const sampleCount = this.getVisibleSamples().length;
        return (
            <div className={styles.monitor} role="dialog" aria-label="FPS 监视器">
                <header className={styles.header}>
                    <div className={styles.title}>
                        <span className={styles.pulse} />
                        <span>性能监视器</span>
                        {paused ? <span className={styles.pausedTag}>已暂停记录</span> : null}
                    </div>
                    <button
                        type="button"
                        className={styles.close}
                        onClick={() => this.setState({open: false})}
                        aria-label="关闭"
                    >
                        ×
                    </button>
                </header>
                <div className={styles.liveRow}>
                    <span className={`${styles.liveValue} ${fps >= 50 ? styles.good : (fps >= 30 ? styles.medium : styles.bad)}`}>
                        {fps}
                    </span>
                    <span className={styles.liveUnit}>FPS</span>
                    <span className={styles.liveHint}>{sampleCount ? `窗口内 ${sampleCount} 个采样` : '等待采样'}</span>
                </div>
                <div className={styles.chartWrap}>
                    <canvas ref={this.setCanvas} className={styles.chart} />
                    <div className={styles.chartMeta}>
                        <span>最近 {windowSeconds === 0 ? '全部' : `${windowSeconds} 秒`}</span>
                        <span>平均 {stats.avg} · 最低 {stats.min} · 最高 {stats.max}</span>
                    </div>
                </div>
                <div className={styles.stats}>
                    <div><strong>{stats.avg}</strong><span>平均 FPS</span></div>
                    <div><strong>{stats.min}</strong><span>最低 FPS</span></div>
                    <div><strong>{stats.max}</strong><span>最高 FPS</span></div>
                    <div><strong className={stats.drops ? styles.dropCount : ''}>{stats.drops}</strong><span>低于 50 次</span></div>
                </div>
                <div className={styles.ranges}>
                    {[60, 300, 0].map(seconds => (
                        <button
                            key={seconds}
                            type="button"
                            className={windowSeconds === seconds ? styles.rangeActive : styles.range}
                            onClick={() => this.setState({windowSeconds: seconds})}
                        >
                            {seconds === 0 ? '全部' : `${seconds >= 60 ? seconds / 60 : seconds}${seconds >= 60 ? ' 分钟' : ' 秒'}`}
                        </button>
                    ))}
                </div>
                <div className={styles.actions}>
                    <button type="button" className={styles.secondary} onClick={this.handleTogglePause}>
                        {paused ? '继续记录' : '暂停记录'}
                    </button>
                    <button type="button" className={styles.secondary} onClick={this.handleClear}>清空</button>
                    <button type="button" className={styles.primary} onClick={this.handleExport}>导出日志</button>
                </div>
                <p className={styles.foot}>采样自编辑器 requestAnimationFrame；切到后台时会暂停计时。</p>
            </div>
        );
    }

    render () {
        const {fps, open} = this.state;
        const fpsClass = fps >= 50 ? styles.chipGood : (fps >= 30 ? styles.chipMedium : styles.chipBad);
        return (
            <div className={styles.wrap}>
                <button
                    type="button"
                    className={styles.chip}
                    onClick={() => this.setState(previous => ({open: !previous.open}))}
                    title="性能计时器 · 点击查看 FPS 曲线与日志"
                >
                    <span className={styles.chipPulse} />
                    <strong className={`${styles.chipValue} ${fpsClass}`}>{fps}</strong>
                    <span className={styles.chipLabel}>FPS</span>
                </button>
                {open ? this.renderPanel() : null}
            </div>
        );
    }
}

export default PointerFpsMonitor;
