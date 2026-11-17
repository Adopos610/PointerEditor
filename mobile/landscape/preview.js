(() => {
  const $ = selector => document.querySelector(selector);
  const screen = $('#screen');
  const toast = $('#toast');
  const blockCount = $('#blockCount');
  const roleChip = $('#roleChip');
  const stageCard = $('#stageCard');
  const stageFull = $('#stageFull');
  const palette = $('#palette');
  const paletteHost = $('#paletteBlockly');
  const collabSheet = $('#collabSheet');
  const scrim = $('#scrim');
  const zoomLabel = $('#zoomLabel');
  let toastTimer = 0;
  let zoom = 90;
  let addedCount = 0;

  const showToast = message => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const fitDevice = () => {
    const device = $('#device');
    const landscapePhone = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    const scale = landscapePhone
      ? Math.min(window.innerWidth / 844, window.innerHeight / 390)
      : Math.min((window.innerWidth - 32) / 858, (window.innerHeight - 150) / 404, 1.2);
    device.style.zoom = Math.max(scale, 0.35);
  };
  window.addEventListener('resize', fitDevice);
  fitDevice();

  Blockly.ScratchMsgs.setLocale('zh-cn');
  const MEDIA = 'blockly/media/';
  const workspaceOptions = {
    media: MEDIA,
    toolbox: Blockly.Xml.textToDom('<xml></xml>'),
    zoom: {controls: false, wheel: false, startScale: 0.9, minScale: 0.6, maxScale: 1.4},
    move: {scrollbars: false, drag: true, wheel: false},
    trashcan: false,
    sounds: false,
    scrollbars: false
  };
  const mainWorkspace = Blockly.inject('blocklyWorkspace', workspaceOptions);
  window.mainWorkspace = mainWorkspace;

  const sampleXml = Blockly.Xml.textToDom(`
    <xml>
      <block type="event_whenflagclicked" x="34" y="38">
        <next>
          <block type="motion_movesteps">
            <value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
            <next>
              <block type="motion_ifonedgebounce">
                <next>
                  <block type="looks_sayforsecs">
                    <value name="MESSAGE"><shadow type="text"><field name="TEXT">你好！</field></shadow></value>
                    <value name="SECS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </xml>
  `);
  Blockly.Xml.domToWorkspace(sampleXml, mainWorkspace);

  const paletteWorkspace = Blockly.inject('paletteBlockly', {
    media: MEDIA,
    zoom: {controls: false, wheel: false, startScale: 0.74, minScale: 0.6, maxScale: 1},
    move: {scrollbars: false, drag: false, wheel: false},
    trashcan: false,
    sounds: false,
    scrollbars: false,
    readOnly: true
  });
  window.paletteWorkspace = paletteWorkspace;

  const blockNames = {
    motion_movesteps: '移动 10 步',
    motion_turnright: '右转 15 度',
    motion_gotoxy: '移到 0,0',
    motion_ifonedgebounce: '碰到边缘就反弹',
    looks_sayforsecs: '说 你好! 2 秒',
    looks_nextcostume: '下一个造型',
    sound_stopallsounds: '停止所有声音',
    sound_setvolumeto: '音量设为 100',
    event_whenflagclicked: '当绿旗被点击',
    event_whenthisspriteclicked: '当角色被点击',
    control_wait: '等待 1 秒',
    control_repeat: '重复执行 10 次'
  };

  const palettes = {
    运动: [
      '<block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>',
      '<block type="motion_turnright"><value name="DEGREES"><shadow type="math_number"><field name="NUM">15</field></shadow></value></block>',
      '<block type="motion_gotoxy"><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block>',
      '<block type="motion_ifonedgebounce"></block>'
    ],
    外观: [
      '<block type="looks_sayforsecs"><value name="MESSAGE"><shadow type="text"><field name="TEXT">你好！</field></shadow></value><value name="SECS"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block>',
      '<block type="looks_nextcostume"></block>'
    ],
    声音: [
      '<block type="sound_stopallsounds"></block>',
      '<block type="sound_setvolumeto"><value name="VOLUME"><shadow type="math_number"><field name="NUM">100</field></shadow></value></block>'
    ],
    事件: [
      '<block type="event_whenflagclicked"></block>',
      '<block type="event_whenthisspriteclicked"></block>'
    ],
    控制: [
      '<block type="control_wait"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">1</field></shadow></value></block>',
      '<block type="control_repeat"><value name="TIMES"><shadow type="math_whole_number"><field name="NUM">10</field></shadow></value></block>'
    ]
  };

  const loadPalette = category => {
    paletteWorkspace.clear();
    const items = palettes[category] || [];
    const xml = Blockly.Xml.textToDom('<xml>' + items.map((snippet, index) => (
      snippet.replace('<block ', `<block x="10" y="${8 + index * 66}" `)
    )).join('') + '</xml>');
    Blockly.Xml.domToWorkspace(xml, paletteWorkspace);
    requestAnimationFrame(() => Blockly.svgResize(paletteWorkspace));
  };

  const updateCount = () => {
    const count = mainWorkspace.getAllBlocks().filter(block => !block.isShadow()).length;
    blockCount.textContent = count + ' 个积木';
  };
  updateCount();

  const isPaletteOpen = () => palette.classList.contains('open');
  const openPalette = () => {
    palette.classList.add('open');
    $('#gestureHint').classList.add('hide');
    requestAnimationFrame(() => Blockly.svgResize(paletteWorkspace));
  };
  const closePalette = () => palette.classList.remove('open');

  $('#paletteBtn').addEventListener('click', () => {
    if (isPaletteOpen()) closePalette();
    else openPalette();
  });
  $('#paletteClose').addEventListener('click', closePalette);

  document.querySelectorAll('.palette-cat').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.palette-cat').forEach(item => item.classList.toggle('active', item === button));
      loadPalette(button.dataset.cat);
    });
  });

  paletteHost.addEventListener('click', event => {
    if (!isPaletteOpen()) return;
    const source = paletteWorkspace.getAllBlocks().find(block => (
      !block.isShadow() && block.svgGroup_ && block.svgGroup_.contains(event.target)
    ));
    if (!source) return;
    const roots = mainWorkspace.getTopBlocks(true).filter(block => !block.isShadow());
    const targetRoot = roots.find(block => block.type.indexOf('event_') === 0) || roots[0];
    const clone = Blockly.Xml.blockToDom(source, true);
    const y = 96 + (addedCount % 4) * 62;
    clone.setAttribute('x', '34');
    clone.setAttribute('y', String(y));
    const created = Blockly.Xml.domToBlock(clone, mainWorkspace);
    if (created && !created.getSvgRoot()) {
      created.initSvg();
      created.render();
    }
    if (created && created.previousConnection && targetRoot) {
      let tail = targetRoot;
      while (tail && tail.getNextBlock()) tail = tail.getNextBlock();
      if (tail && tail.nextConnection) {
        try {
          tail.nextConnection.connect(created.previousConnection);
        } catch (error) {
          // leave the block as a new top-level stack
        }
      }
    }
    addedCount += 1;
    updateCount();
    closePalette();
    showToast('已添加：' + (blockNames[source.type] || '积木'));
  });

  const setRunning = running => {
    screen.classList.toggle('running', running);
    stageCard.classList.toggle('running', running);
    $('#runBtn').classList.toggle('active', running);
    $('#runBtnFull').classList.toggle('active', running);
    $('#stopBtn').classList.toggle('active', running);
    $('#stopBtnFull').classList.toggle('active', running);
  };
  const run = () => { setRunning(true); showToast('运行中 · 积木已经开始执行'); };
  const stop = () => { setRunning(false); showToast('已停止运行'); };
  $('#runBtn').addEventListener('click', run);
  $('#runBtnFull').addEventListener('click', run);
  $('#stopBtn').addEventListener('click', stop);
  $('#stopBtnFull').addEventListener('click', stop);

  const openStage = () => { stageFull.classList.add('open'); closePalette(); };
  const closeStage = () => stageFull.classList.remove('open');
  stageCard.addEventListener('click', openStage);
  $('#stageThumb').addEventListener('click', openStage);
  $('#stageClose').addEventListener('click', closeStage);

  document.querySelectorAll('.rail-btn[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.mode === '代码') {
        document.querySelectorAll('.rail-btn[data-mode]').forEach(item => item.classList.toggle('active', item === button));
        closeStage();
        return;
      }
      showToast(button.dataset.mode + '面板会复用正式编辑器的画板，不另做一套');
    });
  });
  $('#extBtn').addEventListener('click', () => showToast('扩展面板：正式版会从底部滑出'));
  $('#projectBtn').addEventListener('click', () => showToast('这里会打开项目菜单'));
  $('#undoBtn').addEventListener('click', () => showToast('已撤销上一步'));
  $('#redoBtn').addEventListener('click', () => showToast('已重做'));
  $('#saveBtn').addEventListener('click', () => showToast('已保存到本机'));
  $('#moreBtn').addEventListener('click', () => showToast('更多操作：导出、设置与帮助'));
  $('#addSprite').addEventListener('click', () => showToast('已添加角色3（预览示意）'));

  document.querySelectorAll('.sprite').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.sprite').forEach(item => item.classList.toggle('active', item === button));
      roleChip.textContent = button.dataset.sprite;
      showToast('切换到 ' + button.dataset.sprite);
    });
  });

  const applyZoom = () => {
    mainWorkspace.setScale(zoom / 100);
    zoomLabel.textContent = zoom + '%';
    requestAnimationFrame(() => Blockly.svgResize(mainWorkspace));
  };
  $('#zoomOut').addEventListener('click', () => {
    zoom = Math.max(60, zoom - 10);
    applyZoom();
  });
  $('#zoomIn').addEventListener('click', () => {
    zoom = Math.min(140, zoom + 10);
    applyZoom();
  });

  const openCollab = () => {
    closePalette();
    scrim.classList.add('show');
    collabSheet.classList.add('open');
  };
  const closeCollab = () => {
    scrim.classList.remove('show');
    collabSheet.classList.remove('open');
  };
  $('#collabBtn').addEventListener('click', openCollab);
  $('#sheetClose').addEventListener('click', closeCollab);
  scrim.addEventListener('click', closeCollab);
  $('#sheetRequest').addEventListener('click', () => showToast('已向 阿蓝 发送编辑申请'));
  $('#sheetRelease').addEventListener('click', () => {
    showToast('已释放「角色1」的编辑权');
    $('#sheetRelease').closest('.sheet-role').querySelector('.status').textContent = '可编辑';
    $('#sheetRelease').closest('.sheet-role').querySelector('.status').className = 'status';
    $('#sheetRelease').textContent = '认领';
  });
  $('#sheetClaim').addEventListener('click', event => {
    const button = event.currentTarget;
    const status = button.closest('.sheet-role').querySelector('.status');
    const claimed = status.textContent === '我 已锁定';
    status.textContent = claimed ? '可编辑' : '我 已锁定';
    status.className = claimed ? 'status' : 'status blue';
    button.textContent = claimed ? '认领' : '释放';
    showToast(claimed ? '已释放「角色2」' : '已认领「角色2」');
  });

  let lockedAll = false;
  $('#sheetLock').addEventListener('click', event => {
    lockedAll = !lockedAll;
    const button = event.currentTarget;
    button.textContent = lockedAll ? '解锁全部代码' : '锁定全部代码';
    button.classList.toggle('locked', lockedAll);
    document.querySelectorAll('.sheet-role .status').forEach(status => {
      const role = status.closest('.sheet-role').querySelector('strong').textContent;
      if (lockedAll) {
        status.textContent = '房主已锁定';
        status.className = 'status amber';
      } else {
        status.textContent = role === '舞台' ? '阿蓝 已锁定' : (role === '角色1' ? '我 已锁定' : '可编辑');
        status.className = role === '舞台' ? 'status amber' : (role === '角色1' ? 'status blue' : 'status');
      }
    });
    showToast(lockedAll ? '已锁定全部代码' : '已解锁全部代码');
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePalette();
      closeStage();
      closeCollab();
    }
  });

  loadPalette('运动');
  requestAnimationFrame(() => {
    Blockly.svgResize(mainWorkspace);
    Blockly.svgResize(paletteWorkspace);
  });
  new ResizeObserver(() => {
    Blockly.svgResize(mainWorkspace);
    Blockly.svgResize(paletteWorkspace);
  }).observe($('#workspace'));
})();
