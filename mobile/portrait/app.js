(() => {
  const $ = selector => document.querySelector(selector);
  const screen = $('#screen');
  const codePage = $('#pageCode');
  const picker = $('#picker');
  const paletteHost = $('#paletteBlockly');
  const toast = $('#toast');
  const orb = $('#orb');
  const orbMenu = $('#orbMenu');
  const scrim = $('#scrim');
  const sheets = [...document.querySelectorAll('.sheet')];
  const blockCount = $('#blockCount');
  const roleChip = $('#roleChip');
  const zoomLabel = $('#zoomLabel');
  const selectedRoleName = $('#selectedRoleName');
  let toastTimer = 0;
  let zoom = 90;
  let addedCount = 0;
  let selectedRole = '角色1';
  let lockedAll = false;
  let activeSheet = null;

  const showToast = message => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const fitDevice = () => {
    const portraitPhone = window.matchMedia('(orientation: portrait) and (max-width: 600px)').matches;
    const designW = portraitPhone ? 390 : 404;
    const designH = portraitPhone ? 844 : 858;
    const availW = portraitPhone ? window.innerWidth : window.innerWidth - 32;
    const availH = portraitPhone ? window.innerHeight : window.innerHeight - 120;
    const scale = Math.min(availW / designW, availH / designH, portraitPhone ? 1.12 : 1);
    const applied = Math.max(scale, 0.3);
    $('#device').style.transform = 'scale(' + applied + ')';
    $('#phoneStage').style.width = designW * applied + 'px';
    $('#phoneStage').style.height = designH * applied + 'px';
  };
  window.addEventListener('resize', fitDevice);
  fitDevice();

  Blockly.ScratchMsgs.setLocale('zh-cn');
  const MEDIA = 'blockly/media/';
  if (Blockly.Blocks && Blockly.Blocks.defaultToolbox) Blockly.Blocks.defaultToolbox = null;
  const mainWorkspace = Blockly.inject('blocklyWorkspace', {
    media: MEDIA,
    zoom: {controls: false, wheel: false, startScale: 0.9, minScale: 0.6, maxScale: 1.4},
    move: {scrollbars: false, drag: true, wheel: false},
    trashcan: false,
    sounds: false,
    scrollbars: false
  });
  window.mainWorkspace = mainWorkspace;

  Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(`
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
  `), mainWorkspace);

  const paletteWorkspace = Blockly.inject('paletteBlockly', {
    media: MEDIA,
    zoom: {controls: false, wheel: false, startScale: 0.8, minScale: 0.6, maxScale: 1},
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
      snippet.replace('<block ', '<block x="10" y="' + (8 + index * 74) + '" ')
    )).join('') + '</xml>');
    Blockly.Xml.domToWorkspace(xml, paletteWorkspace);
    requestAnimationFrame(() => Blockly.svgResize(paletteWorkspace));
  };

  const updateCount = () => {
    const count = mainWorkspace.getAllBlocks().filter(block => !block.isShadow()).length;
    blockCount.textContent = count + ' 个积木';
  };
  updateCount();

  const resizeMain = () => requestAnimationFrame(() => Blockly.svgResize(mainWorkspace));

  const showPage = name => {
    closeSheets();
    closePicker();
    closeOrbMenu();
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const page = $('#page' + name.charAt(0).toUpperCase() + name.slice(1));
    if (page) page.classList.add('active');
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.page === name));
    if (name === 'code') setTimeout(resizeMain, 60);
    if (name === 'looks' || name === 'sound') {
      $('#looksRole').textContent = selectedRole;
      $('#soundRole').textContent = selectedRole;
    }
  };

  const openPicker = () => {
    if (!codePage.classList.contains('active')) showPage('code');
    closeOrbMenu();
    picker.classList.add('open');
    codePage.classList.add('picking');
    screen.classList.add('picking');
    setTimeout(() => {
      Blockly.svgResize(mainWorkspace);
      Blockly.svgResize(paletteWorkspace);
    }, 420);
  };
  const closePicker = () => {
    picker.classList.remove('open');
    codePage.classList.remove('picking');
    screen.classList.remove('picking');
    if (codePage.classList.contains('active')) setTimeout(resizeMain, 420);
  };
  const isPickerOpen = () => picker.classList.contains('open');
  $('#pickBtn').addEventListener('click', () => {
    if (isPickerOpen()) closePicker();
    else openPicker();
  });
  $('#pickerDone').addEventListener('click', closePicker);

  document.querySelectorAll('.picker-cat').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.picker-cat').forEach(item => item.classList.toggle('active', item === button));
      loadPalette(button.dataset.cat);
    });
  });

  paletteHost.addEventListener('click', event => {
    if (!isPickerOpen()) return;
    const source = paletteWorkspace.getAllBlocks().find(block => (
      !block.isShadow() && block.svgGroup_ && block.svgGroup_.contains(event.target)
    ));
    if (!source) return;
    const roots = mainWorkspace.getTopBlocks(true).filter(block => !block.isShadow());
    const targetRoot = roots.find(block => block.type.indexOf('event_') === 0) || roots[0];
    const clone = Blockly.Xml.blockToDom(source, true);
    clone.setAttribute('x', '34');
    clone.setAttribute('y', String(96 + (addedCount % 4) * 62));
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
          // The block remains at the top level if the connection is unavailable.
        }
      }
    }
    addedCount += 1;
    updateCount();
    showToast('已添加：' + (blockNames[source.type] || '积木'));
  });

  let running = false;
  const setRunning = value => {
    running = value;
    screen.classList.toggle('running', value);
    $('#runBtn').classList.toggle('active', value);
    $('#stopBtn').classList.toggle('active', value);
  };
  $('#runBtn').addEventListener('click', () => { setRunning(true); showToast('运行中'); });
  $('#stopBtn').addEventListener('click', () => { setRunning(false); showToast('已停止'); });

  $('#zoomOut').addEventListener('click', () => {
    zoom = Math.max(60, zoom - 10);
    mainWorkspace.setScale(zoom / 100);
    zoomLabel.textContent = zoom + '%';
    resizeMain();
  });
  $('#zoomIn').addEventListener('click', () => {
    zoom = Math.min(140, zoom + 10);
    mainWorkspace.setScale(zoom / 100);
    zoomLabel.textContent = zoom + '%';
    resizeMain();
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showPage(tab.dataset.page));
  });

  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(item => item.classList.toggle('selected', item === card));
      selectedRole = card.dataset.role;
      selectedRoleName.textContent = selectedRole;
      roleChip.textContent = selectedRole;
      $('#looksRole').textContent = selectedRole;
      $('#soundRole').textContent = selectedRole;
      showToast('已选择 ' + selectedRole);
    });
  });
  $('#stageRoleCard').addEventListener('click', () => {
    document.querySelectorAll('.role-card').forEach(item => item.classList.remove('selected'));
    selectedRole = '舞台';
    selectedRoleName.textContent = '舞台';
    roleChip.textContent = '舞台';
    showToast('已选择舞台');
  });
  $('#addRole').addEventListener('click', () => {
    const grid = $('#roleGrid');
    if (grid.querySelectorAll('.role-card').length >= 4) {
      showToast('预览最多展示 4 个角色');
      return;
    }
    const index = grid.querySelectorAll('.role-card').length + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'role-card';
    button.dataset.role = '角色' + index;
    button.innerHTML = '<span class="role-avatar"><img src="' + $('.app-logo img').src + '" alt=""></span><span class="role-meta"><strong>角色' + index + '</strong><span>可编辑</span></span>';
    button.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(item => item.classList.toggle('selected', item === button));
      selectedRole = button.dataset.role;
      selectedRoleName.textContent = selectedRole;
      roleChip.textContent = selectedRole;
      showToast('已选择 ' + selectedRole);
    });
    grid.appendChild(button);
    showToast('已添加角色' + index);
  });
  document.querySelectorAll('[data-go]').forEach(button => {
    button.addEventListener('click', () => showPage(button.dataset.go));
  });

  document.querySelectorAll('.costume-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.querySelectorAll('.costume-thumb').forEach(item => item.classList.toggle('active', item === thumb));
      $('#lookPreview img').src = thumb.querySelector('img').src;
      showToast('已切换造型预览');
    });
  });
  $('#addCostume').addEventListener('click', () => showToast('已添加造型（预览示意）'));
  $('#openPaint').addEventListener('click', () => {
    openNote('矢量画板直接挂载 scratch-paint 组件。预览不重画图形编辑器，正式 APK 中会使用现有的矢量画板、图形工具和撤销栈。');
  });
  document.querySelectorAll('.sound-play').forEach(button => {
    button.addEventListener('click', () => showToast('声音播放预览'));
  });
  $('#addSound').addEventListener('click', () => showToast('已添加声音（预览示意）'));

  const closeSheets = () => {
    sheets.forEach(sheet => sheet.classList.remove('open'));
    scrim.classList.remove('show');
    screen.classList.remove('overlay-open');
    activeSheet = null;
  };
  const openSheet = sheet => {
    closePicker();
    closeOrbMenu();
    sheets.forEach(item => item.classList.toggle('open', item === sheet));
    scrim.classList.add('show');
    screen.classList.add('overlay-open');
    activeSheet = sheet;
  };
  const openNote = text => {
    $('#noteText').textContent = text;
    openSheet($('#noteSheet'));
  };
  const openCollab = () => openSheet($('#collabSheet'));
  $('#collabBtn').addEventListener('click', openCollab);
  $('#collabClose').addEventListener('click', closeSheets);
  $('#noteClose').addEventListener('click', closeSheets);
  $('#noteOk').addEventListener('click', closeSheets);
  $('#orbClose').addEventListener('click', closeSheets);
  scrim.addEventListener('click', closeSheets);
  $('#releaseRole').addEventListener('click', event => {
    const row = event.currentTarget.closest('.collab-role');
    const status = row.querySelector('.status');
    if (status.textContent === '我 已锁定') {
      status.textContent = '可编辑';
      status.className = 'status';
      event.currentTarget.textContent = '认领';
      showToast('已释放「角色1」');
    } else {
      status.textContent = '我 已锁定';
      status.className = 'status blue';
      event.currentTarget.textContent = '释放';
      showToast('已认领「角色1」');
    }
  });
  $('#claimRole').addEventListener('click', event => {
    const row = event.currentTarget.closest('.collab-role');
    const status = row.querySelector('.status');
    if (status.textContent === '我 已锁定') {
      status.textContent = '可编辑';
      status.className = 'status';
      event.currentTarget.textContent = '认领';
      showToast('已释放「角色2」');
    } else {
      status.textContent = '我 已锁定';
      status.className = 'status blue';
      event.currentTarget.textContent = '释放';
      showToast('已认领「角色2」');
    }
  });
  $('#lockAll').addEventListener('click', event => {
    lockedAll = !lockedAll;
    event.currentTarget.textContent = lockedAll ? '解锁全部代码' : '锁定全部代码';
    event.currentTarget.classList.toggle('locked', lockedAll);
    document.querySelectorAll('.collab-role .status').forEach(status => {
      const peer = status.textContent.indexOf('阿蓝') === 0;
      if (lockedAll) {
        status.textContent = '房主已锁定';
        status.className = 'status amber';
      } else {
        status.textContent = peer ? '阿蓝 已锁定' : '我 已锁定';
        status.className = peer ? 'status amber' : 'status blue';
      }
    });
    showToast(lockedAll ? '已锁定全部代码' : '已解锁全部代码');
  });

  const allActions = [
    {id: 'run', label: '运行', icon: 'i-flag', hint: '绿旗'},
    {id: 'stop', label: '停止', icon: 'i-stop', hint: '全部'},
    {id: 'picker', label: '挑选积木', icon: 'i-plus', hint: '一步添加'},
    {id: 'roles', label: '切换角色', icon: 'i-people', hint: '角色页'},
    {id: 'collab', label: '在线协作', icon: 'i-cloud', hint: '房间 2048'},
    {id: 'save', label: '保存作品', icon: 'i-save', hint: '本地'},
    {id: 'looks', label: '造型', icon: 'i-brush', hint: '角色'},
    {id: 'sound', label: '声音', icon: 'i-sound', hint: '角色'}
  ];
  let chosenActions = ['run', 'picker', 'roles', 'collab'];
  try {
    const saved = JSON.parse(localStorage.getItem('pointer.mobile.orb.actions') || 'null');
    if (Array.isArray(saved) && saved.length) {
      chosenActions = saved.filter(id => allActions.some(action => action.id === id));
      if (!chosenActions.length) chosenActions = ['run', 'picker', 'roles', 'collab'];
    }
  } catch (error) {
    // Keep the default shortcuts.
  }

  const executeAction = id => {
    closeOrbMenu();
    if (id === 'run') {
      showPage('code');
      setRunning(true);
      showToast('运行中');
    } else if (id === 'stop') {
      setRunning(false);
      showToast('已停止');
    } else if (id === 'picker') {
      showPage('code');
      setTimeout(openPicker, 80);
    } else if (id === 'roles') {
      showPage('roles');
    } else if (id === 'collab') {
      openCollab();
    } else if (id === 'save') {
      showToast('已保存到本机');
    } else if (id === 'looks' || id === 'sound') {
      showPage(id);
    }
  };

  const renderOrbMenu = () => {
    const selected = chosenActions.map(id => allActions.find(action => action.id === id)).filter(Boolean);
    orbMenu.innerHTML = '<div class="orb-menu-head"><strong>快捷操作</strong><span>悬浮球</span></div>' +
      selected.map(action => '<button class="orb-action" type="button" data-orb-action="' + action.id + '"><svg viewBox="0 0 24 24"><use href="#' + action.icon + '"/></svg>' + action.label + '<span class="shortcut">' + action.hint + '</span></button>').join('') +
      '<button class="orb-customize" type="button" id="customizeOrb"><svg viewBox="0 0 24 24"><use href="#i-gear"/></svg>自定义悬浮球</button>';
    orbMenu.querySelectorAll('[data-orb-action]').forEach(button => {
      button.addEventListener('click', () => executeAction(button.dataset.orbAction));
    });
    $('#customizeOrb').addEventListener('click', openOrbSheet);
  };

  const closeOrbMenu = () => orbMenu.classList.remove('open');
  const positionOrb = () => {
    const defaultPos = {x: 318, y: 632};
    let pos = defaultPos;
    try {
      const saved = JSON.parse(localStorage.getItem('pointer.mobile.orb.pos') || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) pos = saved;
    } catch (error) {
      // Use default position.
    }
    orb.style.left = pos.x + 'px';
    orb.style.top = pos.y + 'px';
    orb.dataset.x = pos.x;
    orb.dataset.y = pos.y;
  };
  positionOrb();

  const positionOrbMenu = () => {
    const x = Number(orb.dataset.x);
    const y = Number(orb.dataset.y);
    const width = orbMenu.offsetWidth || 196;
    const height = orbMenu.offsetHeight || 200;
    let left = x + 56 - width;
    if (left < 8) left = Math.min(x, 390 - width - 8);
    left = Math.max(8, Math.min(left, 390 - width - 8));
    let top = y - height - 10;
    if (top < 76) top = y + 64;
    top = Math.max(76, Math.min(top, 776 - height - 8));
    orbMenu.style.left = left + 'px';
    orbMenu.style.top = top + 'px';
  };

  const openOrbMenu = () => {
    renderOrbMenu();
    orbMenu.classList.add('open');
    requestAnimationFrame(positionOrbMenu);
  };

  const closeSheetsIfAny = () => {
    if (activeSheet) closeSheets();
  };

  let dragging = false;
  let moved = false;
  let dragStart = null;
  orb.addEventListener('pointerdown', event => {
    if (screen.classList.contains('overlay-open')) return;
    closeOrbMenu();
    const scale = screen.getBoundingClientRect().width / 390 || 1;
    const rect = orb.getBoundingClientRect();
    dragging = true;
    moved = false;
    dragStart = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: Number(orb.dataset.x),
      y: Number(orb.dataset.y),
      scale
    };
    orb.setPointerCapture(event.pointerId);
  });
  orb.addEventListener('pointermove', event => {
    if (!dragging || !dragStart) return;
    const dx = (event.clientX - dragStart.pointerX) / dragStart.scale;
    const dy = (event.clientY - dragStart.pointerY) / dragStart.scale;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
    const x = Math.max(8, Math.min(390 - 56 - 8, dragStart.x + dx));
    const y = Math.max(76, Math.min(776 - 56 - 8, dragStart.y + dy));
    orb.style.left = x + 'px';
    orb.style.top = y + 'px';
    orb.dataset.x = x;
    orb.dataset.y = y;
  });
  const endOrbDrag = event => {
    if (!dragging) return;
    dragging = false;
    if (orb.hasPointerCapture(event.pointerId)) orb.releasePointerCapture(event.pointerId);
    localStorage.setItem('pointer.mobile.orb.pos', JSON.stringify({x: Number(orb.dataset.x), y: Number(orb.dataset.y)}));
    if (!moved) openOrbMenu();
  };
  orb.addEventListener('pointerup', endOrbDrag);
  orb.addEventListener('pointercancel', endOrbDrag);

  document.addEventListener('pointerdown', event => {
    if (!orbMenu.classList.contains('open')) return;
    if (orbMenu.contains(event.target) || orb.contains(event.target)) return;
    closeOrbMenu();
  });

  const openOrbSheet = () => {
    closeOrbMenu();
    renderCustomActions();
    openSheet($('#orbSheet'));
  };
  const renderCustomActions = () => {
    const list = $('#customList');
    list.innerHTML = allActions.map(action => (
      '<label class="custom-row"><span class="cicon"><svg viewBox="0 0 24 24"><use href="#' + action.icon + '"/></svg></span>' + action.label + '<input type="checkbox" value="' + action.id + '"' + (chosenActions.includes(action.id) ? ' checked' : '') + '></label>'
    )).join('');
  };
  $('#saveOrb').addEventListener('click', () => {
    const checked = [...document.querySelectorAll('#customList input:checked')].map(input => input.value);
    if (!checked.length) {
      showToast('至少保留一个快捷操作');
      return;
    }
    chosenActions = checked;
    localStorage.setItem('pointer.mobile.orb.actions', JSON.stringify(chosenActions));
    closeSheets();
    showToast('悬浮球已更新');
  });

  $('#projectBtn').addEventListener('click', () => showToast('项目菜单：重命名、导出与设置'));
  $('#moreBtn').addEventListener('click', () => openNote('更多菜单会在正式移动版中提供项目设置、导出、帮助和版本信息。这个原型先聚焦编辑、角色和悬浮球流程。'));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSheets();
      closePicker();
      closeOrbMenu();
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
  }).observe($('#pageCode'));
})();
