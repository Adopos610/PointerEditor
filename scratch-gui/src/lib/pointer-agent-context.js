const DEFAULT_MAX_CHARS = 12000;
const MAX_TARGETS = 40;
const MAX_SCRIPTS_PER_TARGET = 24;
const MAX_LINES_PER_TARGET = 100;
const MAX_TOTAL_LINES = 520;
const MAX_INLINE_DEPTH = 3;
const MAX_COSTUME_NAMES = 12;
const MAX_SOUND_NAMES = 12;
const MAX_VARIABLE_VALUE = 80;
const MAX_LIST_ITEMS = 5;

const HAT_OPCODES = new Set([
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked',
    'event_whenstageclicked',
    'event_whenbackdropswitchesto',
    'event_whengreaterthan',
    'event_whenbroadcastreceived',
    'control_start_as_clone',
    'procedures_definition'
]);

const BLOCK_TEMPLATES = {
    event_whenflagclicked: '当绿旗被点击',
    event_whenkeypressed: '当按下 {KEY_OPTION} 键',
    event_whenthisspriteclicked: '当角色被点击',
    event_whenstageclicked: '当舞台被点击',
    event_whenbackdropswitchesto: '当背景换成 {BACKDROP}',
    event_whengreaterthan: '当 {WHENGREATERTHANMENU} > {VALUE}',
    event_whenbroadcastreceived: '当收到广播 {BROADCAST_OPTION}',
    event_broadcast: '广播 {BROADCAST_INPUT}',
    event_broadcastandwait: '广播 {BROADCAST_INPUT} 并等待',

    control_wait: '等待 {DURATION} 秒',
    control_repeat: '重复执行 {TIMES} 次',
    control_forever: '重复执行',
    control_if: '如果 {CONDITION} 那么',
    control_if_else: '如果 {CONDITION} 那么 … 否则',
    control_wait_until: '等待直到 {CONDITION}',
    control_repeat_until: '重复执行直到 {CONDITION}',
    control_while: '当 {CONDITION} 重复执行',
    control_for_each: '对于 {VARIABLE} 中的每个 {VALUE}',
    control_start_as_clone: '当作为克隆体启动时',
    control_create_clone_of: '克隆 {CLONE_OPTION}',
    control_delete_this_clone: '删除此克隆体',
    control_stop: '停止 {STOP_OPTION}',

    motion_movesteps: '移动 {STEPS} 步',
    motion_turnright: '右转 {DEGREES} 度',
    motion_turnleft: '左转 {DEGREES} 度',
    motion_goto: '移到 {TO}',
    motion_gotoxy: '移到 x: {X} y: {Y}',
    motion_glideto: '在 {SECS} 秒内滑行到 {TO}',
    motion_glidesecstoxy: '在 {SECS} 秒内滑行到 x: {X} y: {Y}',
    motion_pointindirection: '面向 {DIRECTION} 方向',
    motion_pointtowards: '面向 {TOWARDS}',
    motion_changexby: '将 x 坐标增加 {DX}',
    motion_setx: '将 x 坐标设为 {X}',
    motion_changeyby: '将 y 坐标增加 {DY}',
    motion_sety: '将 y 坐标设为 {Y}',
    motion_ifonedgebounce: '碰到边缘就反弹',
    motion_setrotationstyle: '将旋转方式设为 {STYLE}',
    motion_xposition: 'x 坐标',
    motion_yposition: 'y 坐标',
    motion_direction: '方向',

    looks_say: '说 {MESSAGE}',
    looks_sayforsecs: '说 {MESSAGE} {SECS} 秒',
    looks_think: '思考 {MESSAGE}',
    looks_thinkforsecs: '思考 {MESSAGE} {SECS} 秒',
    looks_show: '显示',
    looks_hide: '隐藏',
    looks_switchcostumeto: '换成 {COSTUME} 造型',
    looks_nextcostume: '下一个造型',
    looks_switchbackdropto: '换成 {BACKDROP} 背景',
    looks_nextbackdrop: '下一个背景',
    looks_changeeffectby: '将 {EFFECT} 特效增加 {CHANGE}',
    looks_seteffectto: '将 {EFFECT} 特效设定为 {VALUE}',
    looks_cleargraphiceffects: '清除图形特效',
    looks_changesizeby: '将大小增加 {CHANGE}',
    looks_setsizeto: '将大小设为 {SIZE}',
    looks_gotofrontback: '移到最 {FRONT_BACK}',
    looks_goforwardbackward: '前移/后移 {NUM} 层',
    looks_costumename: '造型名称',
    looks_backdropnumbername: '背景 {NUMBER_NAME}',
    looks_size: '大小',

    sound_play: '播放声音 {SOUND_MENU}',
    sound_playuntildone: '播放声音 {SOUND_MENU} 等待播完',
    sound_stopallsounds: '停止所有声音',
    sound_changeeffectby: '将 {EFFECT} 音效增加 {VALUE}',
    sound_seteffectto: '将 {EFFECT} 音效设定为 {VALUE}',
    sound_cleareffects: '清除音效',
    sound_changevolumeby: '将音量增加 {VOLUME}',
    sound_setvolumeto: '将音量设为 {VOLUME}',
    sound_volume: '音量',

    sensing_touchingobject: '碰到 {TOUCHINGOBJECTMENU}?',
    sensing_touchingcolor: '碰到颜色 {COLOR}?',
    sensing_coloristouchingcolor: '颜色 {COLOR} 碰到 {COLOR2}?',
    sensing_distanceto: '到 {DISTANCETOMENU} 的距离',
    sensing_askandwait: '询问 {QUESTION} 并等待',
    sensing_answer: '回答',
    sensing_keypressed: '按下 {KEY_OPTION} 键?',
    sensing_mousedown: '按下鼠标?',
    sensing_mousex: '鼠标 x 坐标',
    sensing_mousey: '鼠标 y 坐标',
    sensing_setdragmode: '将拖动模式设为 {DRAG_MODE}',
    sensing_loudness: '响度',
    sensing_timer: '计时器',
    sensing_resettimer: '重置计时器',
    sensing_of: '{PROPERTY} of {OBJECT}',
    sensing_current: '当前 {CURRENTMENU}',
    sensing_dayssince2000: '2000 年至今的天数',
    sensing_username: '用户名',

    operator_add: '{NUM1} + {NUM2}',
    operator_subtract: '{NUM1} - {NUM2}',
    operator_multiply: '{NUM1} * {NUM2}',
    operator_divide: '{NUM1} / {NUM2}',
    operator_random: '在 {FROM} 和 {TO} 之间取随机数',
    operator_gt: '{OPERAND1} > {OPERAND2}',
    operator_lt: '{OPERAND1} < {OPERAND2}',
    operator_equals: '{OPERAND1} = {OPERAND2}',
    operator_and: '{OPERAND1} 且 {OPERAND2}',
    operator_or: '{OPERAND1} 或 {OPERAND2}',
    operator_not: '不成立 {OPERAND}',
    operator_join: '连接 {STRING1} 和 {STRING2}',
    operator_letter_of: '{STRING} 的第 {LETTER} 个字符',
    operator_length: '{STRING} 的长度',
    operator_contains: '{STRING1} 包含 {STRING2}?',
    operator_mod: '{NUM1} 除以 {NUM2} 的余数',
    operator_round: '四舍五入 {NUM}',
    operator_mathop: '{OPERATOR} {NUM}',

    data_setvariableto: '将 {VARIABLE} 设为 {VALUE}',
    data_changevariableby: '将 {VARIABLE} 增加 {VALUE}',
    data_showvariable: '显示变量 {VARIABLE}',
    data_hidevariable: '隐藏变量 {VARIABLE}',
    data_addtolist: '将 {ITEM} 加入列表 {LIST}',
    data_deleteoflist: '删除列表 {LIST} 的第 {INDEX} 项',
    data_deletealloflist: '删除列表 {LIST} 的全部项目',
    data_insertatlist: '在列表 {LIST} 的第 {INDEX} 项前插入 {ITEM}',
    data_replaceitemoflist: '将列表 {LIST} 的第 {INDEX} 项替换为 {ITEM}',
    data_itemoflist: '列表 {LIST} 的第 {INDEX} 项',
    data_itemnumoflist: '列表 {LIST} 中 {ITEM} 的编号',
    data_lengthoflist: '列表 {LIST} 的长度',
    data_listcontainsitem: '列表 {LIST} 包含 {ITEM}?',
    data_showlist: '显示列表 {LIST}',
    data_hidelist: '隐藏列表 {LIST}',

    procedures_definition: '定义 {PROCCode}',
    procedures_call: '调用 {PROCCode}',
    argument_reporter_string_number: '{VALUE}',
    argument_reporter_boolean: '{VALUE}'
};

const cleanText = (value, max = 120) => {
    const text = String(value === undefined || value === null ? '' : value)
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
};

const roundNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
};

const getBlocks = target => (
    target && target.blocks && target.blocks._blocks ? target.blocks._blocks : {}
);

const getScriptIds = target => {
    if (target && target.blocks && typeof target.blocks.getScripts === 'function') {
        return target.blocks.getScripts().slice();
    }
    const blocks = getBlocks(target);
    return Object.keys(blocks).filter(id => blocks[id] && blocks[id].topLevel);
};

const getFieldValue = (block, name) => {
    const field = block && block.fields && block.fields[name];
    return field && field.value !== undefined ? cleanText(field.value, 60) : '';
};

const getShadowValue = block => {
    if (!block) return '';
    const fields = block.fields || {};
    const keys = Object.keys(fields);
    for (const key of keys) {
        const field = fields[key];
        if (field && field.value !== undefined) return cleanText(field.value, 60);
    }
    return '';
};

const getSubstackId = (block, name) => {
    const input = block && block.inputs && block.inputs[name];
    return input && input.block ? input.block : null;
};

const describeFallback = (block, blocks, depth) => {
    const parts = [];
    const fields = block.fields || {};
    Object.keys(fields).forEach(key => {
        const field = fields[key];
        if (field && field.value !== undefined) parts.push(`${key}=${cleanText(field.value, 60)}`);
    });
    const inputs = block.inputs || {};
    Object.keys(inputs).forEach(key => {
        if (key === 'SUBSTACK' || key === 'SUBSTACK2') return;
        const value = resolveInput(block, key, blocks, depth);
        if (value) parts.push(`${key}=${value}`);
    });
    return `[${block.opcode}${parts.length ? ` ${parts.join(', ')}` : ''}]`;
};

const resolveInput = (block, name, blocks, depth) => {
    const input = block && block.inputs && block.inputs[name];
    if (!input) return '';
    if (Array.isArray(input)) return cleanText(input[0], 60);
    if (typeof input !== 'object') return cleanText(input, 60);
    const id = input.block || input.shadow;
    if (!id) return '';
    const child = blocks[id];
    if (!child) return '';
    if (child.shadow) return getShadowValue(child);
    return describeInline(child, blocks, depth + 1);
};

const describeInline = (block, blocks, depth) => {
    if (!block) return '';
    if (depth > MAX_INLINE_DEPTH) return `[${block.opcode}]`;
    const template = BLOCK_TEMPLATES[block.opcode];
    if (!template) return describeFallback(block, blocks, depth);
    const fields = {...(block.fields || {})};
    if ((block.opcode === 'procedures_definition' || block.opcode === 'procedures_call') &&
        block.mutation && block.mutation.proccode) {
        fields.PROCCode = {value: block.mutation.proccode};
    }
    const used = new Set();
    let text = template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
        used.add(key);
        if (fields[key] && fields[key].value !== undefined) {
            return cleanText(fields[key].value, 60) || '（空）';
        }
        const value = resolveInput(block, key, blocks, depth);
        return value || '（空）';
    });
    const extras = Object.keys(fields)
        .filter(key => !used.has(key) && fields[key] && fields[key].value !== undefined)
        .map(key => `${key}=${cleanText(fields[key].value, 60)}`);
    if (extras.length) text += `（${extras.join(', ')}）`;
    return text.replace(/\s+/g, ' ').trim();
};

const buildScript = (topId, blocks, maxLines) => {
    const lines = [];
    const seen = new Set();
    const walk = (id, level, isTop) => {
        if (!id || seen.has(id) || lines.length >= maxLines) return;
        const block = blocks[id];
        if (!block || block.shadow) return;
        seen.add(id);
        lines.push(`${'  '.repeat(level)}${describeInline(block, blocks, 0)}`);
        const substack = getSubstackId(block, 'SUBSTACK');
        if (substack) walk(substack, level + 1, false);
        const substack2 = getSubstackId(block, 'SUBSTACK2');
        if (substack2) {
            if (lines.length < maxLines) lines.push(`${'  '.repeat(level + 1)}否则:`);
            walk(substack2, level + 1, false);
        }
        if (block.next) {
            const nextLevel = isTop && HAT_OPCODES.has(block.opcode) ? level + 1 : level;
            walk(block.next, nextLevel, false);
        }
    };
    walk(topId, 0, true);
    return lines;
};

const countTargetBlocks = target => {
    const blocks = getBlocks(target);
    return Object.keys(blocks).reduce((count, id) => (
        count + (blocks[id] && !blocks[id].shadow ? 1 : 0)
    ), 0);
};

const formatListValue = value => {
    if (!Array.isArray(value)) return '[]';
    const items = value.slice(0, MAX_LIST_ITEMS).map(item => cleanText(item, 24));
    const suffix = value.length > MAX_LIST_ITEMS ? `, …共 ${value.length} 项` : '';
    return `[${items.join(', ')}${suffix}]`;
};

const getTargetVariables = target => {
    const variables = Object.values(target && target.variables ? target.variables : {});
    return variables
        .filter(variable => variable && !variable.isCloud)
        .map(variable => {
            const isList = variable.type === 'list';
            const isBroadcast = variable.type === 'broadcast_msg';
            return {
                id: variable.id,
                name: cleanText(variable.name, 40) || '未命名',
                type: isList ? 'list' : (isBroadcast ? 'broadcast' : 'variable'),
                value: isList ?
                    formatListValue(variable.value) :
                    cleanText(variable.value, MAX_VARIABLE_VALUE)
            };
        });
};

const getCostumeNames = target => {
    const costumes = target && target.sprite && Array.isArray(target.sprite.costumes) ?
        target.sprite.costumes : [];
    return costumes
        .map(costume => cleanText(costume && costume.name, 40))
        .filter(Boolean)
        .slice(0, MAX_COSTUME_NAMES);
};

const getCurrentCostumeName = target => {
    const costumes = target && target.sprite && Array.isArray(target.sprite.costumes) ?
        target.sprite.costumes : [];
    const index = Number(target && target.currentCostume);
    return costumes[index] ? cleanText(costumes[index].name, 40) : '';
};

const getSoundNames = target => {
    const sounds = target && target.sprite && Array.isArray(target.sprite.sounds) ?
        target.sprite.sounds : [];
    return sounds
        .map(sound => cleanText(sound && sound.name, 40))
        .filter(Boolean)
        .slice(0, MAX_SOUND_NAMES);
};

const buildTargetSnapshot = (target, editingTargetId, lineBudget, knownBlockCount) => {
    const blocks = getBlocks(target);
    const scriptIds = getScriptIds(target);
    const scripts = [];
    let linesLeft = lineBudget;
    for (const scriptId of scriptIds) {
        if (linesLeft <= 0 || scripts.length >= MAX_SCRIPTS_PER_TARGET) break;
        const lines = buildScript(scriptId, blocks, Math.min(MAX_LINES_PER_TARGET, linesLeft));
        if (!lines.length) continue;
        scripts.push({id: scriptId, lines});
        linesLeft -= lines.length;
    }
    const variables = getTargetVariables(target);
    return {
        id: target.id,
        name: cleanText(target.getName ? target.getName() : target.name, 48) || '未命名角色',
        isStage: Boolean(target.isStage),
        isEditing: target.id === editingTargetId,
        visible: target.visible !== false,
        x: roundNumber(target.x),
        y: roundNumber(target.y),
        size: roundNumber(target.size),
        direction: roundNumber(target.direction),
        layerOrder: Number.isFinite(Number(target.layerOrder)) ? Number(target.layerOrder) : 0,
        costumeNames: getCostumeNames(target),
        currentCostume: getCurrentCostumeName(target),
        costumeCount: target.sprite && Array.isArray(target.sprite.costumes) ?
            target.sprite.costumes.length : 0,
        soundNames: getSoundNames(target),
        soundCount: target.sprite && Array.isArray(target.sprite.sounds) ?
            target.sprite.sounds.length : 0,
        variables: variables.filter(variable => variable.type === 'variable' || variable.type === 'list'),
        broadcasts: variables.filter(variable => variable.type === 'broadcast'),
        blockCount: Number.isFinite(knownBlockCount) ? knownBlockCount : countTargetBlocks(target),
        scriptCount: scriptIds.length,
        scripts,
        truncated: scripts.length < scriptIds.length || linesLeft <= 0
    };
};

const sortTargets = targets => targets.slice().sort((a, b) => {
    if (a.isStage) return -1;
    if (b.isStage) return 1;
    return b.layerOrder - a.layerOrder;
});

export const buildProjectSnapshot = vm => {
    const runtime = vm && vm.runtime;
    const allTargets = runtime && Array.isArray(runtime.targets) ? runtime.targets : [];
    const originals = allTargets.filter(target => target && target.isOriginal !== false);
    const ordered = originals.slice().sort((a, b) => {
        if (a.isStage) return -1;
        if (b.isStage) return 1;
        return 0;
    });
    const selected = ordered.slice(0, MAX_TARGETS);
    const blockCounts = new Map();
    originals.forEach(target => {
        blockCounts.set(target.id, countTargetBlocks(target));
    });
    let totalBlocks = 0;
    blockCounts.forEach(count => {
        totalBlocks += count;
    });
    const editingTargetId = vm && vm.editingTarget ? vm.editingTarget.id : '';
    const targets = selected.map(target => buildTargetSnapshot(
        target,
        editingTargetId,
        Math.min(MAX_LINES_PER_TARGET, MAX_TOTAL_LINES),
        blockCounts.get(target.id)
    ));
    return {
        editingTargetId,
        targetCount: originals.length,
        listedTargetCount: targets.length,
        spriteCount: originals.filter(target => !target.isStage).length,
        cloneCount: allTargets.filter(target => target && target.isOriginal === false).length,
        totalBlockCount: totalBlocks,
        targets: sortTargets(targets),
        truncated: originals.length > MAX_TARGETS
    };
};

const appendLine = (buffer, line) => `${buffer}${line}\n`;

const formatVariables = variables => variables
    .map(variable => `${variable.name}=${variable.value || '（空）'}`)
    .join('、');

const formatTarget = target => {
    let text = '';
    const title = `${target.name}${target.isStage ? '（舞台）' : '（角色）'}${target.isEditing ? '【当前编辑】' : ''}`;
    text = appendLine(text, `## ${title}`);
    text = appendLine(text, `id: ${target.id}`);
    const meta = [];
    if (!target.isStage) {
        meta.push(target.visible ? '可见' : '隐藏');
        meta.push(`x=${target.x}`);
        meta.push(`y=${target.y}`);
        meta.push(`大小=${target.size}%`);
        meta.push(`方向=${target.direction}`);
    }
    meta.push(`造型=${target.costumeCount}`);
    meta.push(`声音=${target.soundCount}`);
    meta.push(`积木=${target.blockCount}`);
    text = appendLine(text, meta.join(' · '));
    if (target.currentCostume) {
        text = appendLine(text, `${target.isStage ? '当前背景' : '当前造型'}: ${target.currentCostume}`);
    }
    if (target.costumeNames.length) {
        text = appendLine(text, `造型/背景: ${target.costumeNames.join('、')}${target.costumeCount > target.costumeNames.length ? '…' : ''}`);
    }
    if (target.soundNames.length) {
        text = appendLine(text, `声音: ${target.soundNames.join('、')}${target.soundCount > target.soundNames.length ? '…' : ''}`);
    }
    if (target.variables.length) {
        text = appendLine(text, `${target.isStage ? '全局变量' : '角色变量'}: ${formatVariables(target.variables)}`);
    }
    if (target.broadcasts.length) {
        text = appendLine(text, `广播: ${target.broadcasts.map(item => item.name).join('、')}`);
    }
    text = appendLine(text, '脚本:');
    if (!target.scripts.length) {
        text = appendLine(text, '  （无脚本）');
    } else {
        target.scripts.forEach(script => {
            script.lines.forEach(line => {
                text = appendLine(text, `  ${line}`);
            });
        });
    }
    if (target.truncated) {
        text = appendLine(text, '  …（该角色脚本已截断）');
    }
    return `${text}\n`;
};

export const serializeProjectSnapshot = (snapshot, maxChars = DEFAULT_MAX_CHARS) => {
    const limit = Number.isFinite(Number(maxChars)) && Number(maxChars) > 2000 ?
        Number(maxChars) : DEFAULT_MAX_CHARS;
    let text = '<project>\n';
    text = appendLine(text, `角色数量: ${snapshot.targetCount}（舞台 + ${snapshot.spriteCount} 个角色）`);
    text = appendLine(text, `积木总数: ${snapshot.totalBlockCount}`);
    if (snapshot.cloneCount) text = appendLine(text, `运行中的克隆体: ${snapshot.cloneCount}`);
    const editingTarget = snapshot.targets.find(target => target.isEditing);
    if (editingTarget) text = appendLine(text, `当前编辑: ${editingTarget.name}`);
    if (snapshot.listedTargetCount && snapshot.listedTargetCount < snapshot.targetCount) {
        text = appendLine(
            text,
            `以下仅列出前 ${snapshot.listedTargetCount} 个角色，其余 ${snapshot.targetCount - snapshot.listedTargetCount} 个未包含。`
        );
    }
    text += '\n';
    for (const target of snapshot.targets) {
        const block = formatTarget(target);
        if (text.length + block.length > limit) {
            text = appendLine(text, '…（上下文已截断，仅包含部分角色和脚本；不要假设未列出的内容不存在）');
            break;
        }
        text += block;
    }
    text = appendLine(text, '</project>');
    if (text.length > limit) {
        text = `${text.slice(0, limit)}\n…（上下文已截断）\n</project>`;
    }
    return text;
};

export const buildProjectContext = (vm, options = {}) => {
    const snapshot = buildProjectSnapshot(vm);
    return serializeProjectSnapshot(snapshot, options.maxChars || DEFAULT_MAX_CHARS);
};

export const getProjectContextStats = vm => {
    const snapshot = buildProjectSnapshot(vm);
    return {
        targetCount: snapshot.targetCount,
        spriteCount: snapshot.spriteCount,
        totalBlockCount: snapshot.totalBlockCount,
        cloneCount: snapshot.cloneCount,
        truncated: snapshot.truncated
    };
};

export {DEFAULT_MAX_CHARS};
