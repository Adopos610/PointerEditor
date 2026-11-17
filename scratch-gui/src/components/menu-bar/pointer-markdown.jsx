import PropTypes from 'prop-types';
import React from 'react';
import styles from './pointer-markdown.css';

const inlinePattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|\[[^\]\n]+\]\((?:https?:\/\/)[^\s)]+\))/g;

const renderInline = (text, prefix) => {
    const source = String(text || '');
    const nodes = [];
    let lastIndex = 0;
    let match;
    const pattern = new RegExp(inlinePattern.source, 'g');
    while ((match = pattern.exec(source))) {
        if (match.index > lastIndex) {
            nodes.push(...splitLines(source.slice(lastIndex, match.index), `${prefix}t${lastIndex}`));
        }
        const token = match[0];
        const key = `${prefix}m${match.index}`;
        if (token.startsWith('`') && token.endsWith('`')) {
            nodes.push(<code key={key} className={styles.inlineCode}>{token.slice(1, -1)}</code>);
        } else if ((token.startsWith('**') && token.endsWith('**')) ||
            (token.startsWith('__') && token.endsWith('__'))) {
            nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), `${key}_`)}</strong>);
        } else if (token.startsWith('~~') && token.endsWith('~~')) {
            nodes.push(<del key={key}>{renderInline(token.slice(2, -2), `${key}_`)}</del>);
        } else if (token.startsWith('*') && token.endsWith('*')) {
            nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}_`)}</em>);
        } else if (token.startsWith('_') && token.endsWith('_')) {
            nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}_`)}</em>);
        } else {
            const link = token.match(/^\[([^\]]+)\]\(((?:https?:\/\/)[^\s)]+)\)$/);
            if (link) {
                nodes.push(
                    <a
                        key={key}
                        href={link[2]}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {renderInline(link[1], `${key}_`)}
                    </a>
                );
            } else {
                nodes.push(token);
            }
        }
        lastIndex = match.index + token.length;
    }
    if (lastIndex < source.length) {
        nodes.push(...splitLines(source.slice(lastIndex), `${prefix}e${lastIndex}`));
    }
    return nodes;
};

const splitLines = (text, prefix) => {
    const parts = String(text || '').split('\n');
    const nodes = [];
    parts.forEach((part, index) => {
        if (part) nodes.push(<React.Fragment key={`${prefix}_${index}`}>{part}</React.Fragment>);
        if (index < parts.length - 1) nodes.push(<br key={`${prefix}_br${index}`} />);
    });
    return nodes;
};

const inline = (text, prefix) => renderInline(text, prefix);

const renderCode = (code, language, key) => (
    <pre key={key} className={styles.codeBlock}>
        {language ? <span className={styles.codeLanguage}>{language}</span> : null}
        <code>{code}</code>
    </pre>
);

const splitTableRow = line => line.trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());

const renderBlocks = source => {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();
        if (!trimmed) {
            index += 1;
            continue;
        }
        if (/^```/.test(trimmed)) {
            const language = trimmed.replace(/^```/, '').trim();
            const code = [];
            index += 1;
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                code.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) index += 1;
            blocks.push(renderCode(code.join('\n'), language, `code_${index}`));
            continue;
        }
        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            const Tag = `h${Math.min(level + 2, 6)}`;
            blocks.push(React.createElement(Tag, {key: `h_${index}`, className: styles[`heading${level}`]},
                inline(heading[2], `h_${index}_`)));
            index += 1;
            continue;
        }
        if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
            blocks.push(<hr key={`hr_${index}`} className={styles.hr} />);
            index += 1;
            continue;
        }
        if (trimmed.startsWith('>')) {
            const quoted = [];
            while (index < lines.length && lines[index].trim().startsWith('>')) {
                quoted.push(lines[index].trim().replace(/^>\s?/, ''));
                index += 1;
            }
            blocks.push(
                <blockquote key={`quote_${index}`} className={styles.blockquote}>
                    {renderBlocks(quoted.join('\n'))}
                </blockquote>
            );
            continue;
        }
        if (trimmed.includes('|') && index + 1 < lines.length &&
            /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
            const headers = splitTableRow(lines[index]);
            index += 2;
            const rows = [];
            while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
                rows.push(splitTableRow(lines[index]));
                index += 1;
            }
            blocks.push(
                <div key={`table_${index}`} className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>{headers.map((cell, cellIndex) => (
                                <th key={cellIndex}>{inline(cell, `th_${index}_${cellIndex}_`)}</th>
                            ))}</tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>{row.map((cell, cellIndex) => (
                                    <td key={cellIndex}>{inline(cell, `td_${index}_${rowIndex}_${cellIndex}_`)}</td>
                                ))}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }
        const unordered = /^\s*[-*+]\s+/.test(line);
        const ordered = /^\s*\d+\.\s+/.test(line);
        if (unordered || ordered) {
            const items = [];
            const start = index;
            while (index < lines.length) {
                const current = lines[index];
                const itemMatch = current.match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/);
                if (!itemMatch) break;
                let text = itemMatch[1];
                let task = null;
                const taskMatch = text.match(/^\[([ xX])\]\s+(.*)$/);
                if (taskMatch) {
                    task = taskMatch[1].toLowerCase() === 'x' ? '☑' : '☐';
                    text = taskMatch[2];
                }
                items.push({text, task});
                index += 1;
            }
            const common = items.every(item => item.task);
            const content = items.map((item, itemIndex) => (
                <li key={itemIndex}>
                    {item.task ? <span className={styles.taskMark}>{item.task}</span> : null}
                    {inline(item.text, `li_${start}_${itemIndex}_`)}
                </li>
            ));
            blocks.push(common ? (
                <ul key={`tasks_${start}`} className={styles.taskList}>{content}</ul>
            ) : (
                React.createElement(ordered ? 'ol' : 'ul', {key: `list_${start}`, className: styles.list}, content)
            ));
            continue;
        }
        const paragraph = [line];
        index += 1;
        while (index < lines.length) {
            const next = lines[index];
            const nextTrimmed = next.trim();
            if (!nextTrimmed || /^```/.test(nextTrimmed) || /^(#{1,6})\s+/.test(nextTrimmed) ||
                /^(?:---+|\*\*\*+|___+)$/.test(nextTrimmed) || nextTrimmed.startsWith('>') ||
                /^\s*[-*+]\s+/.test(next) || /^\s*\d+\.\s+/.test(next)) {
                break;
            }
            paragraph.push(next);
            index += 1;
        }
        blocks.push(
            <p key={`p_${index}`} className={styles.paragraph}>
                {inline(paragraph.join('\n'), `p_${index}_`)}
            </p>
        );
    }
    return blocks;
};

const PointerMarkdown = ({content}) => (
    <div className={styles.markdown}>{renderBlocks(content)}</div>
);

PointerMarkdown.propTypes = {
    content: PropTypes.string
};

PointerMarkdown.defaultProps = {
    content: ''
};

export default PointerMarkdown;
