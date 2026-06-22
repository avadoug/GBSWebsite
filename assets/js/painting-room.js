(function () {
  'use strict';

  const WALL_KEY = 'gbs_painting_wall_v1';
  const SNAPSHOT_KEY = 'gbs_painting_snapshots_v1';
  const PRESENCE_KEY = 'gbs_painting_presence_v1';
  const ARTIST_ID_KEY = 'gbs_painting_artist_id_v1';
  const ARTIST_NAME_KEY = 'gbs_painting_artist_name_v1';
  const RECENT_COLORS_KEY = 'gbs_painting_recent_colors_v1';
  const AGE_KEY = 'gbs_age_confirmed_v1';
  const WALL_SLUG = 'main';
  const API_BASE = '/api/painting';
  const LOCAL_FALLBACK_MESSAGE = 'Shared persistence is not connected. This wall is currently saving only in this browser.';
  const WIDTH = 1600;
  const HEIGHT = 1000;
  const MAX_HISTORY = 60;
  const MAX_SNAPSHOTS = 8;
  const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
  const MAX_IMAGE_DIMENSION = 1400;
  const EXTRA_PROPS = [
    'objectId',
    'roomType',
    'roomName',
    'createdBy',
    'createdByName',
    'createdAt',
    'updatedAt',
    'locked',
    'isSymmetryClone',
    'hidden',
    'moderationStatus'
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const nowIso = () => new Date().toISOString();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  const palettes = [
    { name: 'Graffiti Neon', colors: ['#76ff62', '#00e5ff', '#ff3ac8', '#f7ff2f', '#ffffff'] },
    { name: 'Alley Brick', colors: ['#8f2f24', '#c86b42', '#2b211d', '#e2c38f', '#f2ead8'] },
    { name: 'Vaporwave', colors: ['#ff4fd8', '#7b61ff', '#23d5ff', '#fff06a', '#191927'] },
    { name: 'Comic Ink', colors: ['#0b0d0f', '#ffffff', '#ffcf24', '#ed1c24', '#1677ff'] },
    { name: 'Toxic Slime', colors: ['#a7ff2f', '#41d95d', '#17230f', '#ccff00', '#0fffc1'] },
    { name: 'Sunset Wall', colors: ['#ff6d38', '#ffb347', '#ef476f', '#6a3d9a', '#24180f'] },
    { name: 'Blackbook Sketch', colors: ['#111111', '#555555', '#f4f0e8', '#d4c7b0', '#b00020'] },
    { name: 'GBS Green Room', colors: ['#133a27', '#2f7a4a', '#c99b42', '#f4d27a', '#f6f1e5'] }
  ];

  const brushPresets = {
    'fat-cap': { tool: 'spray', size: 62, opacity: 82, softness: 42, density: 62, drip: true },
    'needle-cap': { tool: 'spray', size: 18, opacity: 92, softness: 12, density: 28, drip: false },
    'paint-marker': { tool: 'marker', size: 28, opacity: 72, softness: 8, density: 36, drip: true },
    'wet-ink': { tool: 'ink', size: 34, opacity: 92, softness: 20, density: 20, drip: true },
    'neon-tube': { tool: 'neon', size: 22, opacity: 100, softness: 58, density: 20, drip: false },
    chalk: { tool: 'pencil', size: 16, opacity: 68, softness: 46, density: 20, drip: false },
    'smoke-line': { tool: 'brush', size: 42, opacity: 34, softness: 72, density: 20, drip: false },
    glitch: { tool: 'chaos', size: 24, opacity: 92, softness: 8, density: 46, drip: true }
  };

  const state = {
    tool: 'select',
    shape: 'rect',
    stencil: 'arrow',
    color: '#76ff62',
    secondaryColor: '#ff3ac8',
    alpha: 1,
    size: 18,
    softness: 18,
    density: 36,
    smooth: true,
    drip: true,
    gradient: false,
    fill: false,
    grid: true,
    snap: false,
    symmetry: 'none',
    texture: 'brick',
    fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', Arial, sans-serif",
    fontSize: 72,
    textOutline: true,
    textGlow: true
  };

  const els = {};
  let canvas = null;
  let artistId = localStorage.getItem(ARTIST_ID_KEY);
  let artistName = localStorage.getItem(ARTIST_NAME_KEY) || '';
  let wallVersion = 0;
  let lastLoadedAt = '';
  let saveTimer = null;
  let dirty = false;
  let isLoading = false;
  let isUserDrawing = false;
  let historyLocked = false;
  let history = [];
  let redoStack = [];
  let tombstones = {};
  let drawingObject = null;
  let drawingStart = null;
  let isPanning = false;
  let lastPan = null;
  let broadcast = null;
  let supabase = null;
  let supabaseReady = false;
  let supabaseWarning = '';
  let remoteWallId = null;
  let remotePreviewUrl = '';
  let remoteSnapshots = [];
  let remoteChannel = null;
  let pendingRemoteWall = null;
  let currentUser = null;
  let currentSession = null;
  let currentUserIsAdmin = false;
  let adminData = {
    reports: [],
    assets: [],
    logs: [],
    snapshots: []
  };

  if (!artistId) {
    artistId = uid('artist');
    localStorage.setItem(ARTIST_ID_KEY, artistId);
  }

  function safeJson(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function escapeHTML(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function hexToRgba(hex, alpha = 1) {
    const normalized = String(hex || '#000000').replace('#', '');
    const value = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized.padEnd(6, '0').slice(0, 6);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  function randomizeColor(hex, spread = 28) {
    const source = String(hex || '#76ff62').replace('#', '').padEnd(6, '0').slice(0, 6);
    const channels = [source.slice(0, 2), source.slice(2, 4), source.slice(4, 6)].map((part) => parseInt(part, 16));
    const next = channels.map((channel) => clamp(channel + Math.round((Math.random() - 0.5) * spread), 0, 255));
    return `#${next.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function readRecentColors() {
    return safeJson(localStorage.getItem(RECENT_COLORS_KEY)) || palettes[0].colors.slice(0, 5);
  }

  function rememberColor(color) {
    const recent = [color, ...readRecentColors().filter((item) => item !== color)].slice(0, 10);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent));
    renderRecentColors();
  }

  function toast(message, kind = 'info') {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.dataset.kind = kind;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  function setSaveState(label, detail) {
    if (els.saveState) els.saveState.textContent = label;
    if (els.lastSaved && detail) els.lastSaved.textContent = detail;
  }

  async function initSupabasePersistence() {
    try {
      const clientModule = await import('../../src/lib/supabaseClient.js');
      supabase = clientModule.supabase;
      supabaseReady = Boolean(supabase);
      const { data } = await supabase.auth.getSession();
      currentSession = data?.session || null;
      currentUser = currentSession?.user || null;
      await refreshAdminStatus();
      supabase.auth.onAuthStateChange(async (_event, session) => {
        currentSession = session;
        currentUser = session?.user || null;
        await refreshAdminStatus();
        updateAuthUi();
        if (currentUserIsAdmin) loadAdminData();
        else renderAdminData();
      });
      supabaseWarning = '';
      updatePersistenceWarning();
      updateAuthUi();
      setSaveState('Loading', 'Connecting to Supabase...');
    } catch (err) {
      supabase = null;
      supabaseReady = false;
      supabaseWarning = err?.message || LOCAL_FALLBACK_MESSAGE;
      updatePersistenceWarning();
      updateAuthUi();
      setSaveState('Local only', 'Supabase not connected');
    }
  }

  async function refreshAdminStatus() {
    currentUserIsAdmin = false;
    if (!supabaseReady || !supabase || !currentUser) return;
    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id, role')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (!error && data) currentUserIsAdmin = true;
  }

  function getActorId() {
    return currentUser?.id || artistId;
  }

  function getActorName() {
    return currentUser?.email || artistName || 'Anonymous';
  }

  async function apiFetch(path, payload = {}, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession?.access_token) {
      headers.Authorization = `Bearer ${currentSession.access_token}`;
    }
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'POST',
      headers,
      body: options.method === 'GET' ? undefined : JSON.stringify({
        sessionId: artistId,
        ...payload
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed with ${response.status}`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function loginWithMagicLink() {
    if (!supabaseReady || !supabase) {
      toast('Supabase Auth is not connected yet.', 'error');
      return;
    }
    const email = els.authEmail?.value.trim();
    if (!email) {
      toast('Enter your email first.', 'warn');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Login link sent. Check your email.');
  }

  async function logout() {
    if (!supabaseReady || !supabase) return;
    await supabase.auth.signOut();
    currentSession = null;
    currentUser = null;
    currentUserIsAdmin = false;
    updateAuthUi();
  }

  function updateAuthUi() {
    if (els.accountStatus) {
      els.accountStatus.textContent = currentUser?.email || 'Not logged in';
    }
    if (els.adminBadge) els.adminBadge.hidden = !currentUserIsAdmin;
    if (els.authTitle) els.authTitle.textContent = currentUser ? 'Signed in' : 'Account';
    if (els.authSubtitle) {
      els.authSubtitle.textContent = currentUser
        ? currentUser.email
        : 'Log in to upload images and identify your contributions.';
    }
    if (els.authEmail) {
      els.authEmail.hidden = Boolean(currentUser);
      els.authEmail.value = currentUser?.email || els.authEmail.value;
    }
    if (els.loginBtn) els.loginBtn.hidden = Boolean(currentUser);
    if (els.logoutBtn) els.logoutBtn.hidden = !currentUser;
    if (els.imageUploadHint) {
      els.imageUploadHint.textContent = currentUser
        ? 'PNG, JPG, WebP, GIF. SVG is blocked.'
        : 'Log in to upload images to the wall.';
    }
    $$('.admin-only').forEach((item) => { item.hidden = !currentUserIsAdmin; });
    if (!currentUserIsAdmin && $('#adminPanel')?.classList.contains('active')) {
      $('.dock-tab[data-panel="colorPanel"]')?.click();
    }
  }

  function markSupabaseUnavailable(message) {
    supabase = null;
    supabaseReady = false;
    supabaseWarning = message || LOCAL_FALLBACK_MESSAGE;
    updatePersistenceWarning();
    setSaveState('Offline/local fallback', 'Saving in this browser');
  }

  function updatePersistenceWarning() {
    if (!els.persistenceWarning) return;
    els.persistenceWarning.hidden = supabaseReady;
    els.persistenceWarning.textContent = supabaseReady ? '' : LOCAL_FALLBACK_MESSAGE;
  }

  function mapRemoteWall(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title || 'Painting Room',
      canvasJson: normalizeCanvasJson(row.canvas_json),
      previewImage: row.preview_image_url || '',
      backgroundMode: row.canvas_json?.backgroundMode || row.canvas_json?.background_mode || 'brick',
      version: row.version || 1,
      updatedAt: row.updated_at || '',
      createdAt: row.created_at || '',
      tombstones: row.canvas_json?.tombstones || {}
    };
  }

  function normalizeCanvasJson(json) {
    if (!json || !Object.keys(json).length) return { version: '5.3.0', objects: [] };
    return json;
  }

  function initDomRefs() {
    Object.assign(els, {
      ageGate: $('#ageGate'),
      enterSite: $('#enterSite'),
      leaveSite: $('#leaveSite'),
      navToggle: $('#navToggle'),
      mainNav: $('#mainNav'),
      canvasFrame: $('#canvasFrame'),
      emptyState: $('#canvasEmptyState'),
      toast: $('#canvasToast'),
      artistName: $('#artistName'),
      artistCount: $('#artistCount'),
      accountStatus: $('#accountStatus'),
      adminBadge: $('#adminBadge'),
      saveState: $('#saveState'),
      lastSaved: $('#lastSaved'),
      persistenceWarning: $('#persistenceWarning'),
      wallVersion: $('#wallVersion'),
      miniMap: $('#miniMap'),
      layerList: $('#layerList'),
      paletteList: $('#paletteList'),
      recentColors: $('#recentColors'),
      primaryColor: $('#primaryColor'),
      secondaryColor: $('#secondaryColor'),
      alphaControl: $('#alphaControl'),
      brushSize: $('#brushSize'),
      brushOpacity: $('#brushOpacity'),
      brushSoftness: $('#brushSoftness'),
      sprayDensity: $('#sprayDensity'),
      smoothStroke: $('#smoothStroke'),
      dripMode: $('#dripMode'),
      gradientMode: $('#gradientMode'),
      fillMode: $('#fillMode'),
      shapeSelect: $('#shapeSelect'),
      stencilSelect: $('#stencilSelect'),
      textValue: $('#textValue'),
      fontSelect: $('#fontSelect'),
      fontSize: $('#fontSize'),
      textOutline: $('#textOutline'),
      textGlow: $('#textGlow'),
      imageDrop: $('#imageDrop'),
      imageUpload: $('#imageUpload'),
      imageUploadHint: $('#imageUploadHint'),
      authTitle: $('#authTitle'),
      authSubtitle: $('#authSubtitle'),
      authEmail: $('#authEmail'),
      loginBtn: $('#loginBtn'),
      logoutBtn: $('#logoutBtn'),
      gridToggle: $('#gridToggle'),
      snapToggle: $('#snapToggle'),
      symmetryMode: $('#symmetryMode'),
      textureMode: $('#textureMode'),
      reportReason: $('#reportReason'),
      reportComment: $('#reportComment'),
      snapshotTitle: $('#snapshotTitle'),
      snapshotList: $('#snapshotList'),
      adminSnapshotList: $('#adminSnapshotList'),
      reportQueue: $('#reportQueue'),
      assetQueue: $('#assetQueue'),
      moderationLogList: $('#moderationLogList')
    });
  }

  function initAgeGate() {
    if (!els.ageGate) return;
    if (localStorage.getItem(AGE_KEY) !== 'yes') {
      els.ageGate.classList.add('show');
      els.ageGate.setAttribute('aria-hidden', 'false');
    }
    els.enterSite?.addEventListener('click', () => {
      localStorage.setItem(AGE_KEY, 'yes');
      els.ageGate.classList.remove('show');
      els.ageGate.setAttribute('aria-hidden', 'true');
    });
    els.leaveSite?.addEventListener('click', () => {
      window.location.href = 'https://www.google.com';
    });
  }

  function initNav() {
    els.navToggle?.addEventListener('click', () => {
      const open = els.mainNav.classList.toggle('open');
      els.navToggle.setAttribute('aria-expanded', String(open));
    });
    $$('#mainNav a').forEach((link) => {
      link.addEventListener('click', () => els.mainNav?.classList.remove('open'));
    });
  }

  function configureFabricDefaults() {
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.cornerColor = '#f4d27a';
    fabric.Object.prototype.cornerStrokeColor = '#0c1411';
    fabric.Object.prototype.borderColor = '#00e5ff';
    fabric.Object.prototype.borderScaleFactor = 1.6;
    fabric.Object.prototype.padding = 8;
  }

  function initCanvas() {
    configureFabricDefaults();
    canvas = new fabric.Canvas('paintingCanvas', {
      width: WIDTH,
      height: HEIGHT,
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true
    });

    canvas.perPixelTargetFind = false;
    canvas.defaultCursor = 'default';
    applyTexture(state.texture, false);
    bindCanvasEvents();
    setTool('select');
  }

  function makeTexturePattern(mode) {
    const tile = document.createElement('canvas');
    const size = mode === 'brick' ? 220 : 180;
    tile.width = size;
    tile.height = size;
    const ctx = tile.getContext('2d');

    if (mode === 'transparent') {
      ctx.clearRect(0, 0, size, size);
      return null;
    }

    if (mode === 'brick') {
      ctx.fillStyle = '#b55c40';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(63, 34, 29, .22)';
      for (let y = 0; y < size; y += 54) {
        const offset = (y / 54) % 2 ? 55 : 0;
        for (let x = -offset; x < size; x += 110) {
          ctx.fillRect(x, y, 108, 52);
        }
      }
      ctx.strokeStyle = 'rgba(42, 24, 20, .52)';
      ctx.lineWidth = 3;
      for (let y = 0; y < size; y += 54) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      for (let y = 0; y < size; y += 54) {
        const offset = (y / 54) % 2 ? 55 : 0;
        for (let x = -offset; x < size; x += 110) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 54);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255, 230, 176, .12)';
      for (let i = 0; i < 120; i += 1) ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
    }

    if (mode === 'concrete') {
      ctx.fillStyle = '#9b978b';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i += 1) {
        const light = 110 + Math.random() * 70;
        ctx.fillStyle = `rgba(${light}, ${light}, ${light}, ${Math.random() * 0.22})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5);
      }
      ctx.strokeStyle = 'rgba(35, 38, 34, .16)';
      for (let i = 0; i < 9; i += 1) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, Math.random() * size);
        ctx.lineTo(Math.random() * size, Math.random() * size);
        ctx.stroke();
      }
    }

    if (mode === 'paper') {
      ctx.fillStyle = '#eee4cf';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(93, 72, 42, .08)';
      for (let y = 0; y < size; y += 18) ctx.fillRect(0, y, size, 1);
      for (let i = 0; i < 500; i += 1) ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }

    return new fabric.Pattern({ source: tile, repeat: 'repeat' });
  }

  function applyTexture(mode, shouldSave = true) {
    state.texture = mode;
    if (els.canvasFrame) els.canvasFrame.dataset.texture = mode;
    const pattern = makeTexturePattern(mode);
    if (!canvas) return;
    canvas.setBackgroundColor(pattern || 'rgba(0,0,0,0)', () => {
      canvas.renderAll();
      if (shouldSave) {
        scheduleSave();
        pushHistory();
      }
    });
  }

  function bindCanvasEvents() {
    canvas.on('mouse:down', onCanvasMouseDown);
    canvas.on('mouse:move', onCanvasMouseMove);
    canvas.on('mouse:up', onCanvasMouseUp);
    canvas.on('path:created', (event) => {
      const path = event.path;
      if (!path) return;
      ensureObjectMeta(path, state.tool === 'eraser' ? 'eraser stroke' : `${state.tool} stroke`);
      path.set({
        roomName: readableName(path.roomType),
        strokeLineCap: state.smooth ? 'round' : 'butt',
        strokeLineJoin: state.smooth ? 'round' : 'miter'
      });
      if (state.tool === 'chaos') path.set('stroke', hexToRgba(randomizeColor(state.color, 90), state.alpha));
      addDrips(path);
      applySymmetry(path);
      afterMutation();
    });

    canvas.on('object:added', (event) => {
      if (isLoading || !event.target) return;
      ensureObjectMeta(event.target);
      updateEmptyState();
      renderLayers();
    });

    canvas.on('object:modified', (event) => {
      if (isLoading || !event.target) return;
      touchObject(event.target);
      afterMutation();
    });

    canvas.on('object:removed', (event) => {
      if (isLoading || historyLocked || !event.target) return;
      if (event.target.objectId) tombstones[event.target.objectId] = nowIso();
      afterMutation();
    });

    canvas.on('object:moving', (event) => {
      if (!state.snap || !event.target) return;
      const grid = 20;
      event.target.set({
        left: Math.round(event.target.left / grid) * grid,
        top: Math.round(event.target.top / grid) * grid
      });
    });

    canvas.on('selection:created', renderLayers);
    canvas.on('selection:updated', renderLayers);
    canvas.on('selection:cleared', renderLayers);
  }

  function onCanvasMouseDown(event) {
    isUserDrawing = true;
    const pointer = canvas.getPointer(event.e);
    if (state.tool === 'pan') {
      isPanning = true;
      lastPan = { x: event.e.clientX, y: event.e.clientY };
      canvas.setCursor('grabbing');
      return;
    }

    if (state.tool === 'text') {
      addText(pointer);
      return;
    }

    if (state.tool === 'stencil') {
      addStencil(pointer);
      return;
    }

    if (state.tool === 'line' || state.tool === 'shape') {
      drawingStart = pointer;
      drawingObject = createDrawableObject(pointer, event.e);
      if (drawingObject) {
        ensureObjectMeta(drawingObject, state.tool === 'line' ? 'line' : state.shape);
        canvas.add(drawingObject);
        canvas.setActiveObject(drawingObject);
      }
    }
  }

  function onCanvasMouseMove(event) {
    if (isPanning && lastPan) {
      const vpt = canvas.viewportTransform;
      vpt[4] += event.e.clientX - lastPan.x;
      vpt[5] += event.e.clientY - lastPan.y;
      lastPan = { x: event.e.clientX, y: event.e.clientY };
      canvas.requestRenderAll();
      return;
    }

    if (!drawingObject || !drawingStart) return;
    updateDrawableObject(drawingObject, drawingStart, canvas.getPointer(event.e), event.e);
    canvas.requestRenderAll();
  }

  function onCanvasMouseUp() {
    if (isPanning) {
      isPanning = false;
      canvas.setCursor('grab');
      isUserDrawing = false;
      return;
    }

    if (drawingObject) {
      touchObject(drawingObject);
      drawingObject.setCoords();
      applySymmetry(drawingObject);
      afterMutation();
      drawingObject = null;
      drawingStart = null;
    }
    isUserDrawing = false;
    if (pendingRemoteWall && !dirty) {
      loadRemotePayload(pendingRemoteWall, false);
      pendingRemoteWall = null;
    }
  }

  function readableName(type) {
    return String(type || 'object')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function ensureObjectMeta(object, roomType) {
    if (!object) return object;
    const stamp = nowIso();
    const type = roomType || object.roomType || object.type || 'object';
    object.set({
      objectId: object.objectId || uid('obj'),
      roomType: type,
      roomName: object.roomName || readableName(type),
      createdBy: object.createdBy || getActorId(),
      createdByName: object.createdByName || getActorName(),
      createdAt: object.createdAt || stamp,
      updatedAt: object.updatedAt || stamp,
      moderationStatus: object.moderationStatus || 'active',
      locked: Boolean(object.locked)
    });
    applyLockState(object, Boolean(object.locked));
    return object;
  }

  function touchObject(object) {
    if (!object) return;
    object.set({
      updatedAt: nowIso(),
      createdByName: object.createdByName || getActorName()
    });
  }

  function applyLockState(object, locked) {
    object.set({
      locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked
    });
  }

  function afterMutation() {
    if (isLoading || historyLocked) return;
    updateEmptyState();
    renderLayers();
    pushHistory();
    scheduleSave();
    updateMiniMapSoon();
  }

  function pushHistory() {
    if (!canvas || historyLocked || isLoading) return;
    const current = JSON.stringify(canvas.toJSON(EXTRA_PROPS));
    if (history[history.length - 1] === current) return;
    history.push(current);
    if (history.length > MAX_HISTORY) history.shift();
    redoStack = [];
  }

  function undo() {
    if (history.length <= 1) {
      toast('Nothing to undo yet.');
      return;
    }
    const current = history.pop();
    redoStack.push(current);
    loadCanvasJson(safeJson(history[history.length - 1]), false, () => {
      clearTombstonesForCurrentObjects();
      scheduleSave();
      updateMiniMapSoon();
    });
  }

  function redo() {
    if (!redoStack.length) {
      toast('Nothing to redo yet.');
      return;
    }
    const next = redoStack.pop();
    history.push(next);
    loadCanvasJson(safeJson(next), false, () => {
      scheduleSave();
      updateMiniMapSoon();
    });
  }

  function clearTombstonesForCurrentObjects() {
    canvas.getObjects().forEach((object) => {
      if (object.objectId) delete tombstones[object.objectId];
    });
  }

  function setTool(tool) {
    state.tool = tool;
    $$('.tool-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tool === tool));
    const drawTools = ['brush', 'pencil', 'marker', 'spray', 'ink', 'neon', 'chaos', 'eraser'];
    canvas.isDrawingMode = drawTools.includes(tool);
    canvas.selection = tool === 'select';
    canvas.skipTargetFind = drawTools.includes(tool) || tool === 'pan' || tool === 'line' || tool === 'shape' || tool === 'text' || tool === 'stencil';
    canvas.defaultCursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    canvas.hoverCursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'move' : 'crosshair';
    if (canvas.isDrawingMode) configureBrush();
  }

  function configureBrush() {
    let brush;
    const alpha = state.tool === 'marker' ? Math.min(state.alpha, 0.62) : state.alpha;
    const strokeColor = state.tool === 'chaos' ? randomizeColor(state.color, 70) : state.color;

    if (state.tool === 'spray' && fabric.SprayBrush) {
      brush = new fabric.SprayBrush(canvas);
      brush.width = state.size * 2;
      brush.density = state.density;
      brush.dotWidth = Math.max(1, state.size / 8);
      brush.dotWidthVariance = Math.max(1, state.size / 4);
      brush.randomOpacity = true;
    } else if (state.tool === 'eraser' && fabric.EraserBrush) {
      brush = new fabric.EraserBrush(canvas);
      brush.width = state.size;
    } else {
      brush = new fabric.PencilBrush(canvas);
      brush.width = state.tool === 'pencil' ? Math.max(1, state.size * 0.45) : state.size;
    }

    if (!(state.tool === 'eraser' && fabric.EraserBrush)) {
      brush.color = state.tool === 'eraser'
        ? 'rgba(246,241,229,1)'
        : hexToRgba(strokeColor, alpha);
    }

    const blur = state.tool === 'neon' ? Math.max(14, state.softness * 0.55) : state.softness * 0.18;
    brush.shadow = blur > 0 && state.tool !== 'pencil'
      ? new fabric.Shadow({
          color: hexToRgba(state.tool === 'neon' ? state.secondaryColor : state.color, state.tool === 'neon' ? 0.82 : 0.24),
          blur,
          affectStroke: true
        })
      : null;

    if (typeof brush.decimate === 'number') brush.decimate = state.smooth ? 0.35 : 0;
    canvas.freeDrawingBrush = brush;
  }

  function getShapePaint() {
    if (!state.gradient) return state.fill ? hexToRgba(state.color, state.alpha) : 'transparent';
    return new fabric.Gradient({
      type: 'linear',
      gradientUnits: 'pixels',
      coords: { x1: 0, y1: 0, x2: 260, y2: 180 },
      colorStops: [
        { offset: 0, color: hexToRgba(state.color, state.alpha) },
        { offset: 1, color: hexToRgba(state.secondaryColor, state.alpha) }
      ]
    });
  }

  function commonObjectOptions() {
    return {
      fill: getShapePaint(),
      stroke: hexToRgba(state.color, state.alpha),
      strokeWidth: Math.max(2, state.size / 5),
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      opacity: 1,
      shadow: state.tool === 'neon' || state.textGlow
        ? new fabric.Shadow({ color: hexToRgba(state.secondaryColor, 0.45), blur: 16, affectStroke: true })
        : null
    };
  }

  function createDrawableObject(start) {
    const options = commonObjectOptions();
    if (state.tool === 'line') {
      return new fabric.Line([start.x, start.y, start.x, start.y], {
        ...options,
        roomName: 'Line',
        fill: null
      });
    }

    if (state.shape === 'circle') {
      return new fabric.Ellipse({
        ...options,
        left: start.x,
        top: start.y,
        rx: 1,
        ry: 1,
        roomName: 'Circle'
      });
    }

    if (state.shape === 'triangle') {
      return new fabric.Triangle({
        ...options,
        left: start.x,
        top: start.y,
        width: 1,
        height: 1,
        roomName: 'Triangle'
      });
    }

    if (state.shape === 'polygon') {
      const polygon = new fabric.Polygon(createPolygonPoints(70, 6), {
        ...options,
        left: start.x,
        top: start.y,
        originX: 'center',
        originY: 'center',
        roomName: 'Polygon'
      });
      polygon.scale(0.1);
      return polygon;
    }

    if (state.shape === 'star') {
      const star = new fabric.Polygon(createStarPoints(74, 32, 5), {
        ...options,
        left: start.x,
        top: start.y,
        originX: 'center',
        originY: 'center',
        roomName: 'Star'
      });
      star.scale(0.1);
      return star;
    }

    return new fabric.Rect({
      ...options,
      left: start.x,
      top: start.y,
      width: 1,
      height: 1,
      roomName: 'Rectangle'
    });
  }

  function updateDrawableObject(object, start, pointer, event) {
    let end = pointer;
    if (state.tool === 'line' && event.shiftKey) end = snapLinePoint(start, pointer);

    if (object.type === 'line') {
      object.set({ x2: end.x, y2: end.y });
      return;
    }

    if (object.type === 'polygon' && (state.shape === 'star' || state.shape === 'polygon')) {
      const distance = Math.max(20, Math.hypot(pointer.x - start.x, pointer.y - start.y));
      object.set({ scaleX: distance / 90, scaleY: distance / 90 });
      return;
    }

    const left = Math.min(start.x, pointer.x);
    const top = Math.min(start.y, pointer.y);
    let width = Math.abs(pointer.x - start.x);
    let height = Math.abs(pointer.y - start.y);
    if (event.shiftKey) {
      const size = Math.max(width, height);
      width = size;
      height = size;
    }

    if (object.type === 'ellipse') {
      object.set({ left, top, rx: Math.max(1, width / 2), ry: Math.max(1, height / 2) });
    } else {
      object.set({ left, top, width: Math.max(1, width), height: Math.max(1, height) });
    }
  }

  function snapLinePoint(start, pointer) {
    const dx = pointer.x - start.x;
    const dy = pointer.y - start.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
      x: start.x + Math.cos(snapped) * distance,
      y: start.y + Math.sin(snapped) * distance
    };
  }

  function createPolygonPoints(radius, sides) {
    return Array.from({ length: sides }, (_, index) => {
      const angle = (Math.PI * 2 * index) / sides - Math.PI / 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  }

  function createStarPoints(outer, inner, spikes) {
    const points = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (Math.PI * i) / spikes - Math.PI / 2;
      points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return points;
  }

  function addText(pointer) {
    const text = els.textValue?.value.trim() || 'GBS TAG';
    const object = new fabric.Textbox(text, {
      left: pointer.x,
      top: pointer.y,
      width: 460,
      fontFamily: state.fontFamily,
      fontSize: state.fontSize,
      fill: hexToRgba(state.color, state.alpha),
      stroke: state.textOutline ? hexToRgba(state.secondaryColor, 0.92) : null,
      strokeWidth: state.textOutline ? Math.max(1, state.fontSize / 18) : 0,
      shadow: state.textGlow ? new fabric.Shadow({ color: hexToRgba(state.secondaryColor, 0.55), blur: 20 }) : null,
      paintFirst: 'stroke',
      fontWeight: '900',
      roomName: 'Text tag'
    });
    addObject(object, 'text');
    object.enterEditing?.();
  }

  function addStencil(pointer) {
    const options = commonObjectOptions();
    let object;
    const color = hexToRgba(state.color, state.alpha);
    const accent = hexToRgba(state.secondaryColor, Math.max(0.38, state.alpha * 0.8));

    if (state.stencil === 'arrow') {
      object = new fabric.Polygon([
        { x: -90, y: -28 }, { x: 20, y: -28 }, { x: 20, y: -62 },
        { x: 104, y: 0 }, { x: 20, y: 62 }, { x: 20, y: 28 }, { x: -90, y: 28 }
      ], { ...options, left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', fill: color, roomName: 'Arrow stencil' });
    }

    if (state.stencil === 'splat') {
      const parts = [
        new fabric.Circle({ radius: 48, left: 0, top: 0, fill: color, originX: 'center', originY: 'center' }),
        new fabric.Circle({ radius: 24, left: -58, top: -26, fill: accent, originX: 'center', originY: 'center' }),
        new fabric.Circle({ radius: 19, left: 64, top: -38, fill: color, originX: 'center', originY: 'center' }),
        new fabric.Circle({ radius: 14, left: -18, top: 62, fill: accent, originX: 'center', originY: 'center' }),
        new fabric.Circle({ radius: 10, left: 82, top: 38, fill: color, originX: 'center', originY: 'center' })
      ];
      object = new fabric.Group(parts, { left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', roomName: 'Splat stencil' });
    }

    if (state.stencil === 'star') {
      object = new fabric.Polygon(createStarPoints(82, 34, 8), { ...options, left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', fill: color, roomName: 'Star burst' });
    }

    if (state.stencil === 'bolt') {
      object = new fabric.Polygon([
        { x: -18, y: -95 }, { x: 58, y: -12 }, { x: 16, y: -8 },
        { x: 50, y: 95 }, { x: -58, y: -22 }, { x: -10, y: -18 }
      ], { ...options, left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', fill: color, roomName: 'Lightning stencil' });
    }

    if (state.stencil === 'speech') {
      const bubble = new fabric.Rect({ width: 188, height: 104, rx: 18, ry: 18, left: -94, top: -58, fill: color, stroke: accent, strokeWidth: 8 });
      const tail = new fabric.Triangle({ width: 44, height: 44, left: 32, top: 36, angle: 45, fill: color, stroke: accent, strokeWidth: 4 });
      object = new fabric.Group([bubble, tail], { left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', roomName: 'Speech bubble' });
    }

    if (state.stencil === 'leaf') {
      object = new fabric.Path('M 0 -96 C 70 -54 96 18 0 98 C -96 18 -70 -54 0 -96 Z M 0 -76 L 0 82 M -38 -18 C -16 -8 -8 2 0 18 M 38 -18 C 16 -8 8 2 0 18', {
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        fill: hexToRgba(state.color, Math.max(0.26, state.alpha * 0.7)),
        stroke: accent,
        strokeWidth: 8,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        roomName: 'Leaf stencil'
      });
    }

    if (state.stencil === 'tag') {
      object = new fabric.Path('M -118 46 C -70 -66 -24 78 28 -42 C 46 -84 96 -58 72 2 C 58 40 92 48 120 12', {
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        fill: '',
        stroke: color,
        strokeWidth: Math.max(12, state.size),
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        shadow: new fabric.Shadow({ color: accent, blur: 12 }),
        roomName: 'Tag slash'
      });
    }

    if (state.stencil === 'abstract') {
      object = new fabric.Polygon([
        { x: -108, y: -42 }, { x: -20, y: -88 }, { x: 92, y: -52 },
        { x: 54, y: -8 }, { x: 118, y: 44 }, { x: -12, y: 82 }, { x: -76, y: 30 }
      ], { ...options, left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', fill: color, stroke: accent, strokeWidth: 8, roomName: 'Abstract shard' });
    }

    if (object) addObject(object, 'stencil');
  }

  function addObject(object, roomType) {
    ensureObjectMeta(object, roomType);
    canvas.add(object);
    canvas.setActiveObject(object);
    applySymmetry(object);
    afterMutation();
  }

  function addDrips(source) {
    if (!state.drip || !['spray', 'marker', 'chaos', 'ink'].includes(state.tool) || state.alpha < 0.55) return;
    const bounds = source.getBoundingRect(true, true);
    const count = clamp(Math.round(state.size / 16), 1, 7);
    for (let i = 0; i < count; i += 1) {
      const x = bounds.left + Math.random() * bounds.width;
      const y = bounds.top + bounds.height * (0.45 + Math.random() * 0.45);
      const length = 22 + Math.random() * state.size * 2.2;
      const line = new fabric.Line([x, y, x + (Math.random() - 0.5) * 10, y + length], {
        stroke: hexToRgba(state.tool === 'chaos' ? randomizeColor(state.color, 80) : state.color, Math.min(0.62, state.alpha)),
        strokeWidth: Math.max(2, state.size * (0.08 + Math.random() * 0.08)),
        strokeLineCap: 'round',
        selectable: true,
        evented: true,
        roomName: 'Paint drip'
      });
      ensureObjectMeta(line, 'paint drip');
      canvas.add(line);
    }
  }

  function applySymmetry(object) {
    if (!object || object.isSymmetryClone || state.symmetry === 'none') return;
    const center = new fabric.Point(WIDTH / 2, HEIGHT / 2);
    const objectCenter = object.getCenterPoint();
    const transforms = [];
    if (state.symmetry === 'horizontal') {
      transforms.push({ point: new fabric.Point(WIDTH - objectCenter.x, objectCenter.y), flipX: true, angle: 0 });
    }
    if (state.symmetry === 'vertical') {
      transforms.push({ point: new fabric.Point(objectCenter.x, HEIGHT - objectCenter.y), flipY: true, angle: 0 });
    }
    if (state.symmetry === 'radial') {
      [90, 180, 270].forEach((angle) => {
        transforms.push({ point: fabric.util.rotatePoint(objectCenter, center, fabric.util.degreesToRadians(angle)), angle });
      });
    }

    transforms.forEach((transform) => {
      object.clone((clone) => {
        ensureObjectMeta(clone, object.roomType || object.type);
        clone.set({
          objectId: uid('obj'),
          roomName: `${object.roomName || readableName(object.type)} mirror`,
          isSymmetryClone: true,
          flipX: transform.flipX ? !clone.flipX : clone.flipX,
          flipY: transform.flipY ? !clone.flipY : clone.flipY,
          angle: (clone.angle || 0) + (transform.angle || 0),
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
        clone.setPositionByOrigin(transform.point, 'center', 'center');
        canvas.add(clone);
        updateEmptyState();
        renderLayers();
        scheduleSave();
      }, EXTRA_PROPS);
    });
  }

  function bindUi() {
    $$('.tool-btn').forEach((button) => {
      button.addEventListener('click', () => setTool(button.dataset.tool));
    });

    $$('.preset-btn').forEach((button) => {
      button.addEventListener('click', () => applyBrushPreset(button.dataset.preset));
    });

    els.artistName.value = artistName;
    els.artistName.addEventListener('input', () => {
      artistName = els.artistName.value.trim().slice(0, 24);
      localStorage.setItem(ARTIST_NAME_KEY, artistName);
      updatePresence();
    });

    bindRange(els.brushSize, (value) => { state.size = Number(value); configureBrush(); });
    bindRange(els.brushOpacity, (value) => {
      state.alpha = Number(value) / 100;
      if (state.tool === 'select') applyOpacityToSelection(state.alpha);
      configureBrush();
    });
    bindRange(els.brushSoftness, (value) => { state.softness = Number(value); configureBrush(); });
    bindRange(els.sprayDensity, (value) => { state.density = Number(value); configureBrush(); });
    bindRange(els.alphaControl, (value) => {
      state.alpha = Number(value) / 100;
      els.brushOpacity.value = String(value);
      if (state.tool === 'select') applyOpacityToSelection(state.alpha);
      configureBrush();
    });

    els.primaryColor.addEventListener('input', () => {
      state.color = els.primaryColor.value;
      rememberColor(state.color);
      configureBrush();
    });
    els.secondaryColor.addEventListener('input', () => {
      state.secondaryColor = els.secondaryColor.value;
      rememberColor(state.secondaryColor);
      configureBrush();
    });

    els.smoothStroke.addEventListener('change', () => { state.smooth = els.smoothStroke.checked; configureBrush(); });
    els.dripMode.addEventListener('change', () => { state.drip = els.dripMode.checked; });
    els.gradientMode.addEventListener('change', () => { state.gradient = els.gradientMode.checked; });
    els.fillMode.addEventListener('change', () => { state.fill = els.fillMode.checked; });
    els.shapeSelect.addEventListener('change', () => { state.shape = els.shapeSelect.value; setTool('shape'); });
    els.stencilSelect.addEventListener('change', () => { state.stencil = els.stencilSelect.value; setTool('stencil'); });
    els.fontSelect.addEventListener('change', () => { state.fontFamily = els.fontSelect.value; });
    els.fontSize.addEventListener('input', () => { state.fontSize = Number(els.fontSize.value) || 72; });
    els.textOutline.addEventListener('change', () => { state.textOutline = els.textOutline.checked; });
    els.textGlow.addEventListener('change', () => { state.textGlow = els.textGlow.checked; });

    els.gridToggle.addEventListener('change', () => {
      state.grid = els.gridToggle.checked;
      els.canvasFrame.classList.toggle('grid-on', state.grid);
    });
    els.snapToggle.addEventListener('change', () => { state.snap = els.snapToggle.checked; });
    els.symmetryMode.addEventListener('change', () => { state.symmetry = els.symmetryMode.value; });
    els.textureMode.addEventListener('change', () => applyTexture(els.textureMode.value));

    $('#saveWallBtn')?.addEventListener('click', () => saveWall(true));
    $('#undoBtn')?.addEventListener('click', undo);
    $('#redoBtn')?.addEventListener('click', redo);
    $('#clearMineBtn')?.addEventListener('click', clearMyLastStroke);
    $('#zoomInBtn')?.addEventListener('click', () => zoomBy(1.18));
    $('#zoomOutBtn')?.addEventListener('click', () => zoomBy(0.84));
    $('#fitViewBtn')?.addEventListener('click', fitView);
    $('#resetViewBtn')?.addEventListener('click', resetView);
    $('#fullscreenBtn')?.addEventListener('click', () => els.canvasFrame.requestFullscreen?.());
    $('#eyedropperBtn')?.addEventListener('click', useEyeDropper);
    $('#duplicateBtn')?.addEventListener('click', duplicateSelection);
    $('#deleteBtn')?.addEventListener('click', deleteSelection);
    $('#bringForwardBtn')?.addEventListener('click', () => reorderSelection('forward'));
    $('#sendBackwardBtn')?.addEventListener('click', () => reorderSelection('backward'));
    $('#lockBtn')?.addEventListener('click', toggleSelectionLock);
    $('#hideBtn')?.addEventListener('click', toggleSelectionVisibility);
    $('#groupBtn')?.addEventListener('click', groupSelection);
    $('#ungroupBtn')?.addEventListener('click', ungroupSelection);
    $('#flipXBtn')?.addEventListener('click', () => flipSelection('x'));
    $('#flipYBtn')?.addEventListener('click', () => flipSelection('y'));
    $('#cropBtn')?.addEventListener('click', cropSelectedImage);
    $('#fitImageBtn')?.addEventListener('click', fitSelectedImage);
    $('#downloadPngBtn')?.addEventListener('click', () => downloadCanvas(false));
    $('#downloadTransparentBtn')?.addEventListener('click', () => downloadCanvas(true));
    $('#copyLinkBtn')?.addEventListener('click', copyShareLink);
    $('#reportWallBtn')?.addEventListener('click', reportWall);
    $('#snapshotBtn')?.addEventListener('click', createSnapshot);
    els.loginBtn?.addEventListener('click', loginWithMagicLink);
    els.logoutBtn?.addEventListener('click', logout);
    $('#adminSnapshotBtn')?.addEventListener('click', createSnapshot);
    $('#resetWallBtn')?.addEventListener('click', resetWallAsAdmin);
    $('#moderateHideBtn')?.addEventListener('click', () => moderateSelectedObject('hide'));
    $('#moderateLockBtn')?.addEventListener('click', () => moderateSelectedObject('lock'));
    $('#moderateDeleteBtn')?.addEventListener('click', () => moderateSelectedObject('delete'));

    bindTabs();
    bindImageImport();
    bindKeyboard();
  }

  function bindRange(element, callback) {
    element.addEventListener('input', () => callback(element.value));
  }

  function bindTabs() {
    $$('.dock-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.dock-tab').forEach((item) => item.classList.toggle('active', item === tab));
        $$('.dock-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tab.dataset.panel));
      });
    });
  }

  function bindImageImport() {
    els.imageUpload.addEventListener('change', () => {
      const file = els.imageUpload.files?.[0];
      if (file) importImageFile(file);
      els.imageUpload.value = '';
    });

    els.imageDrop.addEventListener('click', () => els.imageUpload.click());
    ['dragenter', 'dragover'].forEach((name) => {
      els.imageDrop.addEventListener(name, (event) => {
        event.preventDefault();
        els.imageDrop.classList.add('dragging');
      });
      els.canvasFrame.addEventListener(name, (event) => {
        event.preventDefault();
        els.canvasFrame.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach((name) => {
      els.imageDrop.addEventListener(name, () => els.imageDrop.classList.remove('dragging'));
      els.canvasFrame.addEventListener(name, () => els.canvasFrame.classList.remove('dragging'));
    });
    [els.imageDrop, els.canvasFrame].forEach((target) => {
      target.addEventListener('drop', (event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (file) importImageFile(file);
      });
    });

    document.addEventListener('paste', (event) => {
      const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        importImageFile(file);
      }
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      const active = document.activeElement;
      const typing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && key === 's') {
        event.preventDefault();
        saveWall(true);
        return;
      }
      if (mod && key === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (mod && key === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (typing) return;

      const shortcuts = { b: 'brush', e: 'eraser', t: 'text', v: 'select', l: 'line' };
      if (shortcuts[key]) {
        event.preventDefault();
        setTool(shortcuts[key]);
      }
      if (key === 'r') {
        event.preventDefault();
        state.shape = 'rect';
        els.shapeSelect.value = 'rect';
        setTool('shape');
      }
      if (key === 'c') {
        event.preventDefault();
        state.shape = 'circle';
        els.shapeSelect.value = 'circle';
        setTool('shape');
      }
      if (key === 'g') {
        event.preventDefault();
        els.gridToggle.checked = !els.gridToggle.checked;
        els.gridToggle.dispatchEvent(new Event('change'));
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        deleteSelection();
      }
      if (key === 'escape') {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    });
  }

  function applyBrushPreset(name) {
    const preset = brushPresets[name];
    if (!preset) return;
    state.size = preset.size;
    state.alpha = preset.opacity / 100;
    state.softness = preset.softness;
    state.density = preset.density;
    state.drip = preset.drip;
    els.brushSize.value = String(preset.size);
    els.brushOpacity.value = String(preset.opacity);
    els.alphaControl.value = String(preset.opacity);
    els.brushSoftness.value = String(preset.softness);
    els.sprayDensity.value = String(preset.density);
    els.dripMode.checked = preset.drip;
    setTool(preset.tool);
  }

  function applyOpacityToSelection(alpha) {
    const active = canvas.getActiveObject();
    if (!active) return;
    active.set('opacity', alpha);
    touchObject(active);
    canvas.requestRenderAll();
    afterMutation();
  }

  function renderPalettes() {
    els.paletteList.innerHTML = palettes.map((palette) => `
      <div class="palette-card">
        <strong>${escapeHTML(palette.name)}</strong>
        <div>
          ${palette.colors.map((color) => `<button class="swatch" data-color="${color}" type="button" style="background:${color}" title="${color}" aria-label="Use ${color}"></button>`).join('')}
        </div>
      </div>
    `).join('');
    els.paletteList.addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-color]');
      if (!swatch) return;
      state.color = swatch.dataset.color;
      els.primaryColor.value = state.color;
      rememberColor(state.color);
      configureBrush();
    });
    renderRecentColors();
  }

  function renderRecentColors() {
    if (!els.recentColors) return;
    els.recentColors.innerHTML = readRecentColors().map((color) => (
      `<button class="swatch" data-recent-color="${color}" type="button" style="background:${color}" title="${color}" aria-label="Use recent ${color}"></button>`
    )).join('');
    $$('[data-recent-color]', els.recentColors).forEach((button) => {
      button.addEventListener('click', () => {
        state.color = button.dataset.recentColor;
        els.primaryColor.value = state.color;
        configureBrush();
      });
    });
  }

  async function useEyeDropper() {
    if (!window.EyeDropper) {
      toast('Eyedropper is not supported in this browser.', 'warn');
      return;
    }
    try {
      const result = await new EyeDropper().open();
      state.color = result.sRGBHex;
      els.primaryColor.value = state.color;
      rememberColor(state.color);
      configureBrush();
    } catch (err) {
      toast('Eyedropper canceled.');
    }
  }

  async function importImageFile(file) {
    try {
      if (!currentUser) {
        toast('Log in to upload images to the wall.', 'warn');
        $('.dock-tab[data-panel="sharePanel"]')?.click();
        return;
      }
      const data = await uploadPaintingAsset(file);
      fabric.Image.fromURL(data.url, (image) => {
        image.set({
          left: WIDTH / 2,
          top: HEIGHT / 2,
          originX: 'center',
          originY: 'center',
          opacity: state.alpha,
          roomName: file.name.replace(/\.[^.]+$/, '').slice(0, 48) || 'Imported image'
        });
        const fit = Math.min(620 / image.width, 420 / image.height, 1);
        image.scale(fit);
        addObject(image, 'image');
        setTool('select');
        toast('Image added. Use the handles to resize or rotate it.');
      }, { crossOrigin: 'anonymous' });
    } catch (err) {
      toast(err.message || 'Image import failed.', 'error');
    }
  }

  async function uploadPaintingAsset(file) {
    const processed = await validateAndCompressImage(file);
    if (!currentUser) {
      throw new Error('Log in to upload images to the wall.');
    }
    if (!supabaseReady || !supabase || !remoteWallId) {
      throw new Error('Shared persistence is not connected. Image uploads need Supabase login.');
    }

    const data = await apiFetch('/upload-asset', {
      imageData: processed.url,
      fileName: file.name.replace(/\.[^.]+$/, '') || 'imported-art',
      width: processed.width,
      height: processed.height,
      fileType: processed.fileType
    });

    if (currentUserIsAdmin) await loadAdminData();
    return { ...processed, url: data.url, filePath: data.filePath, asset: data.asset };
  }

  function validateAndCompressImage(file) {
    return new Promise((resolve, reject) => {
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.type) || /\.svg$/i.test(file.name)) {
        reject(new Error('Use PNG, JPG, WebP, or GIF. SVG is blocked for safety.'));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error('That image is over 6 MB. Resize it first.'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth > 8000 || image.naturalHeight > 8000) {
            reject(new Error('That image is too large for the wall.'));
            return;
          }
          const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const output = document.createElement('canvas');
          output.width = width;
          output.height = height;
          const ctx = output.getContext('2d');
          ctx.drawImage(image, 0, 0, width, height);
          const mime = file.type === 'image/jpeg' || file.type === 'image/jpg' ? 'image/jpeg' : 'image/png';
          output.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Could not compress that image.'));
              return;
            }
            resolve({
              url: output.toDataURL(mime, 0.86),
              blob,
              width,
              height,
              fileType: mime
            });
          }, mime, 0.86);
        };
        image.onerror = () => reject(new Error('That image could not be decoded.'));
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function getSelectedObjects() {
    const active = canvas.getActiveObject();
    if (!active) return [];
    return active.type === 'activeSelection' ? active.getObjects() : [active];
  }

  function duplicateSelection() {
    const active = canvas.getActiveObject();
    if (!active) {
      toast('Select something to duplicate.');
      return;
    }
    active.clone((clone) => {
      clone.set({
        left: active.left + 28,
        top: active.top + 28,
        objectId: uid('obj'),
        roomName: `${active.roomName || readableName(active.type)} copy`,
        createdBy: getActorId(),
        createdByName: getActorName(),
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      if (clone.type === 'activeSelection') {
        clone.canvas = canvas;
        clone.forEachObject((object) => {
          object.set({
            objectId: uid('obj'),
            createdBy: getActorId(),
            createdByName: getActorName(),
            createdAt: nowIso(),
            updatedAt: nowIso()
          });
          canvas.add(object);
        });
        clone.setCoords();
      } else {
        canvas.add(clone);
      }
      canvas.setActiveObject(clone);
      afterMutation();
    }, EXTRA_PROPS);
  }

  function deleteSelection() {
    const objects = getSelectedObjects();
    if (!objects.length) {
      toast('Select something to delete.');
      return;
    }
    objects.forEach((object) => {
      if (object.objectId) tombstones[object.objectId] = nowIso();
      canvas.remove(object);
    });
    canvas.discardActiveObject();
    afterMutation();
  }

  function clearMyLastStroke() {
    const objects = canvas.getObjects().slice().reverse();
    const mine = objects.find((object) => object.createdBy === artistId && /stroke|drip/.test(object.roomType || ''));
    if (!mine) {
      toast('No stroke from this artist was found.');
      return;
    }
    if (mine.objectId) tombstones[mine.objectId] = nowIso();
    canvas.remove(mine);
    afterMutation();
  }

  function reorderSelection(direction) {
    const objects = getSelectedObjects();
    if (!objects.length) return;
    objects.forEach((object) => {
      direction === 'forward' ? canvas.bringForward(object) : canvas.sendBackwards(object);
      touchObject(object);
    });
    canvas.requestRenderAll();
    afterMutation();
  }

  function toggleSelectionLock() {
    const objects = getSelectedObjects();
    if (!objects.length) return;
    objects.forEach((object) => {
      applyLockState(object, !object.locked);
      touchObject(object);
    });
    canvas.requestRenderAll();
    afterMutation();
  }

  function toggleSelectionVisibility() {
    const objects = getSelectedObjects();
    if (!objects.length) return;
    objects.forEach((object) => {
      object.visible = !object.visible;
      touchObject(object);
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    afterMutation();
  }

  function groupSelection() {
    const active = canvas.getActiveObject();
    if (!active || active.type !== 'activeSelection') {
      toast('Select multiple objects to group.');
      return;
    }
    const group = active.toGroup();
    ensureObjectMeta(group, 'group');
    touchObject(group);
    canvas.setActiveObject(group);
    afterMutation();
  }

  function ungroupSelection() {
    const active = canvas.getActiveObject();
    if (!active || active.type !== 'group') {
      toast('Select a group to ungroup.');
      return;
    }
    active.toActiveSelection();
    canvas.requestRenderAll();
    afterMutation();
  }

  function flipSelection(axis) {
    const objects = getSelectedObjects();
    if (!objects.length) return;
    objects.forEach((object) => {
      object.set(axis === 'x' ? 'flipX' : 'flipY', !object[axis === 'x' ? 'flipX' : 'flipY']);
      touchObject(object);
    });
    canvas.requestRenderAll();
    afterMutation();
  }

  function cropSelectedImage() {
    const image = getSelectedObjects()[0];
    if (!image || image.type !== 'image') {
      toast('Select an imported image to crop.');
      return;
    }
    const element = image.getElement();
    const naturalWidth = element.naturalWidth || image.width;
    const naturalHeight = element.naturalHeight || image.height;
    const displayWidth = image.getScaledWidth();
    const displayHeight = image.getScaledHeight();
    const inset = Math.max(8, Math.min(naturalWidth, naturalHeight) * 0.04);
    const cropX = clamp((image.cropX || 0) + inset, 0, naturalWidth - 80);
    const cropY = clamp((image.cropY || 0) + inset, 0, naturalHeight - 80);
    const nextWidth = Math.max(80, naturalWidth - cropX * 2);
    const nextHeight = Math.max(80, naturalHeight - cropY * 2);
    image.set({ cropX, cropY, width: nextWidth, height: nextHeight });
    image.scaleToWidth(displayWidth);
    if (image.getScaledHeight() > displayHeight) image.scaleToHeight(displayHeight);
    touchObject(image);
    canvas.requestRenderAll();
    afterMutation();
  }

  function fitSelectedImage() {
    const image = getSelectedObjects()[0];
    if (!image || image.type !== 'image') {
      toast('Select an imported image to fit.');
      return;
    }
    image.set({ left: WIDTH / 2, top: HEIGHT / 2, originX: 'center', originY: 'center' });
    image.scale(Math.min((WIDTH * 0.82) / image.width, (HEIGHT * 0.82) / image.height));
    touchObject(image);
    canvas.requestRenderAll();
    afterMutation();
  }

  function renderLayers() {
    if (!els.layerList || !canvas) return;
    const activeIds = new Set(getSelectedObjects().map((object) => object.objectId));
    const objects = canvas.getObjects().slice().reverse();
    if (!objects.length) {
      els.layerList.innerHTML = '<div class="layer-empty">No layers yet.</div>';
      return;
    }
    els.layerList.innerHTML = objects.map((object, index) => {
      const id = escapeHTML(object.objectId);
      const name = escapeHTML(object.roomName || readableName(object.roomType || object.type));
      const type = escapeHTML(object.roomType || object.type);
      const artist = escapeHTML(object.createdByName || 'Anonymous');
      const active = activeIds.has(object.objectId) ? 'active' : '';
      const hidden = object.visible === false ? 'hidden' : '';
      const locked = object.locked ? 'locked' : '';
      return `
        <button class="layer-item ${active} ${hidden} ${locked}" data-layer-id="${id}" type="button">
          <span class="layer-index">${objects.length - index}</span>
          <span>
            <strong>${name}</strong>
            <em>${type} by ${artist}</em>
          </span>
        </button>
      `;
    }).join('');
    $$('[data-layer-id]', els.layerList).forEach((item) => {
      item.addEventListener('click', () => {
        const object = canvas.getObjects().find((entry) => entry.objectId === item.dataset.layerId);
        if (!object) return;
        object.visible = true;
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        renderLayers();
      });
    });
  }

  function updateEmptyState() {
    const empty = canvas.getObjects().length === 0;
    els.emptyState?.classList.toggle('show', empty);
  }

  function zoomBy(multiplier) {
    const zoom = clamp(canvas.getZoom() * multiplier, 0.22, 4);
    canvas.zoomToPoint(new fabric.Point(WIDTH / 2, HEIGHT / 2), zoom);
    canvas.requestRenderAll();
  }

  function fitView() {
    const frame = els.canvasFrame.getBoundingClientRect();
    const scale = clamp(Math.min((frame.width - 28) / WIDTH, (frame.height - 28) / HEIGHT), 0.22, 1);
    canvas.setViewportTransform([scale, 0, 0, scale, (WIDTH - WIDTH * scale) / 2, (HEIGHT - HEIGHT * scale) / 2]);
    canvas.requestRenderAll();
  }

  function resetView() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
  }

  function generatePreview(multiplier = 0.2) {
    try {
      return canvas.toDataURL({ format: 'jpeg', quality: 0.72, multiplier });
    } catch (err) {
      return '';
    }
  }

  function updateMiniMapSoon() {
    clearTimeout(updateMiniMapSoon.timer);
    updateMiniMapSoon.timer = setTimeout(() => {
      const preview = generatePreview(0.12);
      if (preview && els.miniMap) els.miniMap.src = preview;
    }, 250);
  }

  function getCurrentWallJson() {
    const json = canvas.toJSON(EXTRA_PROPS);
    delete json.background;
    delete json.backgroundColor;
    delete json.backgroundImage;
    json.backgroundMode = state.texture;
    json.tombstones = tombstones;
    return json;
  }

  function scheduleSave() {
    if (isLoading) return;
    dirty = true;
    setSaveState('Unsaved', 'Autosaving...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWall(false), 900);
  }

  async function saveWall(manual) {
    if (supabaseReady && supabase) {
      await saveWallRemote(manual);
      return;
    }
    saveWallLocal(manual);
  }

  function saveWallLocal(manual) {
    if (!canvas || isLoading) return;
    try {
      const latest = safeJson(localStorage.getItem(WALL_KEY));
      let canvasJson = getCurrentWallJson();
      let mergedTombstones = { ...(latest?.tombstones || {}), ...tombstones };
      let backgroundMode = state.texture;

      if (latest && (latest.version || 0) > wallVersion) {
        const merged = mergeWallState(latest, {
          canvasJson,
          tombstones: mergedTombstones,
          backgroundMode
        });
        canvasJson = merged.canvasJson;
        mergedTombstones = merged.tombstones;
        backgroundMode = merged.backgroundMode;
      }

      const updatedAt = nowIso();
      const payload = {
        id: 'gbs-public-wall',
        title: 'GBS Painting Room',
        canvasJson,
        previewImage: generatePreview(0.16),
        backgroundMode,
        version: Math.max(wallVersion, latest?.version || 0) + 1,
        updatedAt,
        createdAt: latest?.createdAt || updatedAt,
        updatedBy: artistId,
        updatedByName: artistName || 'Anonymous',
        tombstones: mergedTombstones
      };

      try {
        localStorage.setItem(WALL_KEY, JSON.stringify(payload));
      } catch (quotaErr) {
        payload.previewImage = '';
        localStorage.setItem(WALL_KEY, JSON.stringify(payload));
      }

      wallVersion = payload.version;
      lastLoadedAt = payload.updatedAt;
      tombstones = payload.tombstones || {};
      dirty = false;
      setSaveState('Saved', formatTime(payload.updatedAt));
      updateVersionUI();
      updateMiniMapFromPayload(payload);
      broadcastWallUpdate(payload);
      if (manual) toast('Wall saved locally.');
    } catch (err) {
      setSaveState('Save failed', 'Try removing large images.');
      toast('Save failed. The wall may be too large for local storage.', 'error');
    }
  }

  async function saveWallRemote(manual) {
    if (!canvas || isLoading) return;
    try {
      setSaveState('Saving...', 'Supabase API');
      const remote = await fetchRemoteWall();
      if (!remote) {
        markSupabaseUnavailable('Supabase wall row could not be loaded.');
        saveWallLocal(manual);
        return;
      }

      let canvasJson = await prepareCanvasJsonForRemote(getCurrentWallJson());
      let mergedTombstones = { ...(remote.tombstones || {}), ...tombstones };
      let backgroundMode = state.texture;
      let expectedVersion = remote.version || wallVersion || 1;

      if (remote.version > wallVersion) {
        const merged = mergeWallState(remote, {
          canvasJson,
          tombstones: mergedTombstones,
          backgroundMode
        });
        canvasJson = await prepareCanvasJsonForRemote(merged.canvasJson);
        mergedTombstones = merged.tombstones;
        backgroundMode = merged.backgroundMode;
        toast('Newer wall detected. Changes were merged before saving.', 'warn');
      }

      canvasJson.backgroundMode = backgroundMode;
      canvasJson.tombstones = mergedTombstones;
      let data;
      try {
        data = await apiFetch('/save', {
          canvasJson,
          previewImageData: generatePreview(0.18),
          expectedVersion,
          actorName: getActorName()
        });
      } catch (err) {
        if (err.status !== 409 || !err.payload?.wall) throw err;
        const latest = mapRemoteWall(err.payload.wall);
        const merged = mergeWallState(latest, {
          canvasJson,
          tombstones: mergedTombstones,
          backgroundMode
        });
        data = await apiFetch('/save', {
          canvasJson: await prepareCanvasJsonForRemote({
            ...merged.canvasJson,
            backgroundMode: merged.backgroundMode,
            tombstones: merged.tombstones
          }),
          previewImageData: generatePreview(0.18),
          expectedVersion: latest.version,
          actorName: getActorName()
        });
      }

      const saved = mapRemoteWall(data.wall);
      wallVersion = saved.version;
      remoteWallId = saved.id;
      remotePreviewUrl = saved.previewImage || '';
      lastLoadedAt = saved.updatedAt;
      tombstones = saved.tombstones || {};
      dirty = false;
      setSaveState('Saved', formatTime(saved.updatedAt));
      updateVersionUI();
      updateMiniMapFromPayload(saved);
      broadcastWallUpdate(saved);
      if (manual) toast('Wall saved to Supabase.');
    } catch (err) {
      if (err.status === 429) {
        setSaveState('Rate limited', 'Try again shortly');
        toast(err.message, 'warn');
        return;
      }
      if (err.status >= 500) {
        markSupabaseUnavailable(`Supabase API failed: ${err.message}`);
        saveWallLocal(manual);
        toast('Supabase API failed. Saving in this browser for now.', 'error');
        return;
      }
      setSaveState('Save failed', 'Supabase API');
      toast(`Supabase save failed: ${err.message}`, 'error');
    }
  }

  function mergeWallState(latest, local) {
    const latestObjects = latest.canvasJson?.objects || [];
    const localObjects = local.canvasJson?.objects || [];
    const allTombstones = { ...(latest.tombstones || {}), ...(local.tombstones || {}) };
    const byId = new Map();

    [...latestObjects, ...localObjects].forEach((object) => {
      const id = object.objectId || uid('legacy');
      const existing = byId.get(id);
      if (!existing || Date.parse(object.updatedAt || 0) >= Date.parse(existing.updatedAt || 0)) {
        byId.set(id, { ...object, objectId: id });
      }
    });

    const objects = Array.from(byId.values()).filter((object) => {
      const deletedAt = allTombstones[object.objectId];
      return !deletedAt || Date.parse(object.updatedAt || 0) > Date.parse(deletedAt);
    });

    return {
      canvasJson: { ...latest.canvasJson, ...local.canvasJson, objects },
      tombstones: allTombstones,
      backgroundMode: local.backgroundMode || latest.backgroundMode || 'brick'
    };
  }

  async function fetchRemoteWall(forceCreate = false) {
    if (!supabaseReady || !supabase) return null;
    const { data, error } = await supabase
      .from('painting_walls')
      .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
      .eq('slug', WALL_SLUG)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      const wall = mapRemoteWall(data);
      remoteWallId = wall.id;
      remotePreviewUrl = wall.previewImage || '';
      return wall;
    }
    if (!forceCreate) return null;

    const emptyCanvas = {
      version: '5.3.0',
      objects: [],
      backgroundMode: state.texture,
      tombstones: {}
    };
    const { data: created, error: createError } = await supabase
      .from('painting_walls')
      .insert({
        slug: WALL_SLUG,
        title: 'Painting Room',
        canvas_json: emptyCanvas
      })
      .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
      .single();

    if (createError) throw createError;
    const wall = mapRemoteWall(created);
    remoteWallId = wall.id;
    remotePreviewUrl = wall.previewImage || '';
    return wall;
  }

  async function prepareCanvasJsonForRemote(json) {
    const copy = JSON.parse(JSON.stringify(normalizeCanvasJson(json)));
    copy.backgroundMode = copy.backgroundMode || state.texture;
    copy.tombstones = copy.tombstones || tombstones;
    if (!supabaseReady || !supabase || !remoteWallId) return copy;
    await persistEmbeddedDataUrlImages(copy);
    return copy;
  }

  async function persistEmbeddedDataUrlImages(json) {
    const imageObjects = [];
    collectImageObjects(json.objects || [], imageObjects);
    if (!currentUser && imageObjects.some((object) => object.src && String(object.src).startsWith('data:image/'))) {
      throw new Error('Log in to upload embedded images before saving the shared wall.');
    }
    for (const object of imageObjects) {
      if (!object.src || !String(object.src).startsWith('data:image/')) continue;
      const data = await apiFetch('/upload-asset', {
        imageData: object.src,
        fileName: object.roomName || 'embedded-image',
        width: object.width,
        height: object.height
      });
      object.src = data.url;
    }
  }

  function collectImageObjects(objects, output) {
    objects.forEach((object) => {
      if (object.type === 'image') output.push(object);
      if (Array.isArray(object.objects)) collectImageObjects(object.objects, output);
    });
  }

  async function loadWall(force = false) {
    if (supabaseReady && supabase) {
      await loadWallRemote(force);
      return;
    }
    loadWallLocal(force);
  }

  function loadWallLocal(force = false) {
    const wall = safeJson(localStorage.getItem(WALL_KEY));
    if (!wall) {
      wallVersion = 0;
      lastLoadedAt = '';
      applyTexture(state.texture, false);
      pushHistory();
      updateEmptyState();
      updateVersionUI();
      return;
    }
    if (!force && (wall.version || 0) <= wallVersion) return;
    wallVersion = wall.version || 0;
    lastLoadedAt = wall.updatedAt || '';
    tombstones = wall.tombstones || {};
    state.texture = wall.backgroundMode || 'brick';
    els.textureMode.value = state.texture;
    applyTexture(state.texture, false);
    loadCanvasJson(wall.canvasJson, true, () => {
      history = [JSON.stringify(canvas.toJSON(EXTRA_PROPS))];
      redoStack = [];
      setSaveState('Saved', formatTime(wall.updatedAt));
      updateVersionUI();
      updateMiniMapFromPayload(wall);
      toast(force ? 'Wall loaded.' : 'Latest wall loaded.');
    });
  }

  async function loadWallRemote(force = false) {
    try {
      const wall = await fetchRemoteWall(true);
      if (!wall) {
        markSupabaseUnavailable('Supabase wall row could not be created.');
        loadWallLocal(force);
        return;
      }
      loadRemotePayload(wall, force);
      await loadRemoteSnapshots();
    } catch (err) {
      markSupabaseUnavailable(`Supabase load failed: ${err.message}`);
      loadWallLocal(force);
      toast('Supabase load failed. Using local browser wall.', 'error');
    }
  }

  function loadRemotePayload(payload, force = false) {
    const wall = payload.canvasJson ? payload : mapRemoteWall(payload);
    if (!wall) return;
    if (!force && (wall.version || 0) <= wallVersion) return;
    wallVersion = wall.version || 0;
    remoteWallId = wall.id || remoteWallId;
    remotePreviewUrl = wall.previewImage || remotePreviewUrl;
    lastLoadedAt = wall.updatedAt || '';
    tombstones = wall.tombstones || {};
    state.texture = wall.backgroundMode || 'brick';
    els.textureMode.value = state.texture;
    applyTexture(state.texture, false);
    loadCanvasJson(wall.canvasJson, true, () => {
      history = [JSON.stringify(canvas.toJSON(EXTRA_PROPS))];
      redoStack = [];
      dirty = false;
      setSaveState('Saved', formatTime(wall.updatedAt));
      updateVersionUI();
      updateMiniMapFromPayload(wall);
      toast(force ? 'Supabase wall loaded.' : 'Latest Supabase wall loaded.');
    });
  }

  function loadCanvasJson(json, fromStorage, callback) {
    if (!json) {
      callback?.();
      return;
    }
    const normalizedJson = normalizeCanvasJson(json);
    historyLocked = true;
    isLoading = true;
    canvas.loadFromJSON(normalizedJson, () => {
      canvas.getObjects().forEach((object) => ensureObjectMeta(object));
      canvas.renderAll();
      isLoading = false;
      historyLocked = false;
      updateEmptyState();
      renderLayers();
      updateMiniMapSoon();
      if (!fromStorage) scheduleSave();
      callback?.();
    });
  }

  function updateVersionUI() {
    if (els.wallVersion) els.wallVersion.textContent = `v${wallVersion}`;
  }

  function updateMiniMapFromPayload(payload) {
    if (payload?.previewImage && els.miniMap) {
      els.miniMap.src = payload.previewImage;
    } else {
      updateMiniMapSoon();
    }
  }

  function formatTime(iso) {
    if (!iso) return 'Not saved yet';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Saved';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function broadcastWallUpdate(payload) {
    try {
      broadcast?.postMessage({ type: 'wall-updated', version: payload.version, updatedAt: payload.updatedAt, from: artistId });
    } catch (err) {
      // BroadcastChannel is opportunistic; storage polling still covers static mode.
    }
  }

  function initRealtimeFallbacks() {
    subscribeToWallChanges();

    if ('BroadcastChannel' in window) {
      broadcast = new BroadcastChannel('gbs-painting-room');
      broadcast.addEventListener('message', (event) => {
        if (event.data?.type === 'wall-updated' && event.data.from !== artistId) maybeLoadRemoteUpdate();
        if (event.data?.type === 'presence') renderPresence();
      });
    }

    window.addEventListener('storage', (event) => {
      if (event.key === WALL_KEY) maybeLoadRemoteUpdate();
      if (event.key === PRESENCE_KEY) renderPresence();
    });

    setInterval(maybeLoadRemoteUpdate, supabaseReady ? 7200 : 4200);
  }

  function subscribeToWallChanges() {
    if (!supabaseReady || !supabase || remoteChannel) return;
    remoteChannel = supabase
      .channel('painting-wall-main')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'painting_walls',
          filter: `slug=eq.${WALL_SLUG}`
        },
        (payload) => {
          const incoming = mapRemoteWall(payload.new);
          if (!incoming || incoming.version <= wallVersion) return;
          if (dirty || isUserDrawing) {
            pendingRemoteWall = incoming;
            toast('A newer wall arrived. It will load after your current edit saves.', 'warn');
            return;
          }
          loadRemotePayload(incoming, false);
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          toast('Realtime sync is unavailable. Polling will keep checking for updates.', 'warn');
        }
      });
  }

  async function maybeLoadRemoteUpdate() {
    if (supabaseReady && supabase) {
      try {
        const wall = await fetchRemoteWall(false);
        if (!wall || wall.version <= wallVersion) return;
        if (dirty || isUserDrawing) {
          pendingRemoteWall = wall;
          toast('Newer wall detected. Your next save will merge changes.', 'warn');
          return;
        }
        loadRemotePayload(wall, false);
      } catch (err) {
        toast('Could not poll Supabase for wall updates.', 'warn');
      }
      return;
    }

    const wall = safeJson(localStorage.getItem(WALL_KEY));
    if (!wall || (wall.version || 0) <= wallVersion) return;
    if (dirty) {
      toast('Newer wall detected. Your next save will merge changes.', 'warn');
      return;
    }
    loadWall(false);
  }

  function updatePresence() {
    const all = safeJson(localStorage.getItem(PRESENCE_KEY)) || {};
    const currentTime = Date.now();
    all[artistId] = {
      name: artistName || 'Anonymous',
      color: state.color,
      lastSeen: currentTime
    };
    Object.keys(all).forEach((id) => {
      if (currentTime - all[id].lastSeen > 45000) delete all[id];
    });
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(all));
    try { broadcast?.postMessage({ type: 'presence', from: artistId }); } catch (err) {}
    renderPresence();
  }

  function renderPresence() {
    const all = safeJson(localStorage.getItem(PRESENCE_KEY)) || {};
    const count = Object.values(all).filter((entry) => Date.now() - entry.lastSeen < 45000).length || 1;
    if (els.artistCount) els.artistCount.textContent = String(count);
    const label = count === 1 ? 'artist painting' : 'artists painting';
    $('.presence-card span:last-child') && ($('.presence-card span:last-child').textContent = label);
  }

  function startPresence() {
    updatePresence();
    setInterval(updatePresence, 12000);
  }

  function downloadCanvas(transparent) {
    const backgroundColor = canvas.backgroundColor;
    const backgroundImage = canvas.backgroundImage;
    if (transparent) {
      canvas.backgroundColor = '';
      canvas.backgroundImage = null;
      canvas.renderAll();
    }
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    if (transparent) {
      canvas.backgroundColor = backgroundColor;
      canvas.backgroundImage = backgroundImage;
      canvas.renderAll();
    }
    downloadDataUrl(dataUrl, transparent ? 'gbs-painting-room-transparent.png' : 'gbs-painting-room.png');
  }

  function downloadDataUrl(dataUrl, filename) {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Share link copied.');
    } catch (err) {
      toast('Could not copy the link in this browser.', 'warn');
    }
  }

  async function reportWall() {
    if (!supabaseReady || !supabase) {
      toast('Reports need Supabase. The local wall is still usable.', 'warn');
      return;
    }
    const reason = els.reportReason?.value || 'other';
    const comment = els.reportComment?.value.trim() || '';
    const selected = canvas.getActiveObject();
    const objectId = selected?.objectId || '';

    try {
      await apiFetch('/report', {
        reason,
        comment,
        objectId,
        imageData: generatePreview(0.22)
      });
      if (els.reportComment) els.reportComment.value = '';
      toast('Report sent to the moderation queue.');
      if (currentUserIsAdmin) await loadAdminData();
    } catch (err) {
      toast(err.status === 429 ? 'Report rate limit reached. Try again later.' : `Report failed: ${err.message}`, 'error');
    }
  }

  async function createSnapshot() {
    if (supabaseReady && supabase && remoteWallId) {
      await createRemoteSnapshot();
      return;
    }
    createLocalSnapshot();
  }

  async function createRemoteSnapshot() {
    try {
      const title = els.snapshotTitle.value.trim() || `Wall snapshot ${new Date().toLocaleDateString()}`;
      const imageData = generatePreview(0.32);
      const canvasJson = await prepareCanvasJsonForRemote(getCurrentWallJson());
      const { snapshot } = await apiFetch('/snapshot', {
        title,
        reason: 'manual snapshot',
        canvasJson,
        imageData
      });
      remoteSnapshots.unshift(mapRemoteSnapshot(snapshot));
      remoteSnapshots = remoteSnapshots.slice(0, MAX_SNAPSHOTS);
      els.snapshotTitle.value = '';
      renderSnapshots();
      if (currentUserIsAdmin) await loadAdminData();
      toast('Snapshot saved to Supabase.');
    } catch (err) {
      if (err.status === 429) {
        toast('Snapshot rate limit reached. Try again later.', 'error');
        return;
      }
      toast('Supabase snapshot failed. Saved a local snapshot instead.', 'error');
      createLocalSnapshot();
    }
  }

  function createLocalSnapshot() {
    try {
      const title = els.snapshotTitle.value.trim() || `Wall snapshot ${new Date().toLocaleDateString()}`;
      const snapshots = readSnapshots();
      const snapshot = {
        id: uid('snapshot'),
        wallId: 'gbs-public-wall',
        title,
        imageUrl: generatePreview(0.32),
        canvasJson: getCurrentWallJson(),
        backgroundMode: state.texture,
        version: wallVersion,
        createdAt: nowIso(),
        createdBy: artistId,
        createdByName: artistName || 'Anonymous'
      };
      snapshots.unshift(snapshot);
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
      els.snapshotTitle.value = '';
      renderSnapshots();
      toast('Snapshot saved.');
    } catch (err) {
      toast('Snapshot failed. Local storage may be full.', 'error');
    }
  }

  function readSnapshots() {
    if (supabaseReady) return remoteSnapshots;
    return safeJson(localStorage.getItem(SNAPSHOT_KEY)) || [];
  }

  async function loadRemoteSnapshots() {
    if (!supabaseReady || !supabase || !remoteWallId) return;
    const { data, error } = await supabase
      .from('painting_snapshots')
      .select('id, wall_id, title, image_url, canvas_json, wall_version, created_by, reason, created_at')
      .eq('wall_id', remoteWallId)
      .order('created_at', { ascending: false })
      .limit(MAX_SNAPSHOTS);

    if (error) {
      toast('Snapshots could not load from Supabase.', 'warn');
      return;
    }
    remoteSnapshots = (data || []).map(mapRemoteSnapshot);
    renderSnapshots();
  }

  function mapRemoteSnapshot(row) {
    return {
      id: row.id,
      wallId: row.wall_id,
      title: row.title || 'Wall snapshot',
      imageUrl: row.image_url || '',
      canvasJson: normalizeCanvasJson(row.canvas_json),
      backgroundMode: row.canvas_json?.backgroundMode || 'brick',
      version: row.wall_version || wallVersion,
      createdAt: row.created_at,
      createdBy: row.created_by || 'Supabase',
      createdByName: row.created_by ? 'Authenticated artist' : 'Supabase',
      reason: row.reason || ''
    };
  }

  function renderSnapshots() {
    const snapshots = readSnapshots();
    if (!els.snapshotList) return;
    if (!snapshots.length) {
      els.snapshotList.innerHTML = '<div class="snapshot-empty">No snapshots yet.</div>';
      return;
    }
    els.snapshotList.innerHTML = snapshots.map((snapshot) => `
      <article class="snapshot-card">
        ${snapshot.imageUrl
          ? `<img src="${snapshot.imageUrl}" alt="${escapeHTML(snapshot.title)} preview" />`
          : '<div class="snapshot-thumb-empty">No preview</div>'}
        <div>
          <strong>${escapeHTML(snapshot.title)}</strong>
          <span>${escapeHTML(formatTime(snapshot.createdAt))} ${snapshot.version ? `v${escapeHTML(snapshot.version)}` : ''}</span>
          <div class="snapshot-actions">
            <button data-download-snapshot="${escapeHTML(snapshot.id)}" type="button">Download</button>
            ${supabaseReady
              ? currentUserIsAdmin ? `<button data-restore-snapshot="${escapeHTML(snapshot.id)}" type="button">Restore</button><button data-delete-snapshot="${escapeHTML(snapshot.id)}" type="button">Delete</button>` : ''
              : `<button data-restore-snapshot="${escapeHTML(snapshot.id)}" type="button">Restore</button>`}
          </div>
        </div>
      </article>
    `).join('');
    $$('[data-download-snapshot]', els.snapshotList).forEach((button) => {
      button.addEventListener('click', () => {
        const snapshot = snapshots.find((item) => item.id === button.dataset.downloadSnapshot);
        if (snapshot) downloadDataUrl(snapshot.imageUrl, `${snapshot.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'wall-snapshot'}.jpg`);
      });
    });
    $$('[data-restore-snapshot]', els.snapshotList).forEach((button) => {
      button.addEventListener('click', async () => {
        const snapshot = snapshots.find((item) => item.id === button.dataset.restoreSnapshot);
        if (!snapshot) return;
        if (supabaseReady) {
          await restoreSnapshotAsAdmin(snapshot.id);
          return;
        }
        if (!confirm(`Restore "${snapshot.title}" as the current local wall?`)) return;
        state.texture = snapshot.backgroundMode || 'brick';
        els.textureMode.value = state.texture;
        applyTexture(state.texture, false);
        tombstones = {};
        loadCanvasJson(snapshot.canvasJson, false, () => {
          afterMutation();
          saveWall(true);
        });
      });
    });
    $$('[data-delete-snapshot]', els.snapshotList).forEach((button) => {
      button.addEventListener('click', async () => deleteSnapshotAsAdmin(button.dataset.deleteSnapshot));
    });
  }

  function getSelectedModerationObject() {
    const active = canvas.getActiveObject();
    if (!active) return null;
    if (active.type === 'activeSelection') {
      const objects = active.getObjects().filter((object) => object.objectId);
      return objects.length === 1 ? objects[0] : null;
    }
    return active.objectId ? active : null;
  }

  async function resetWallAsAdmin() {
    if (!currentUserIsAdmin) {
      toast('Admin access is required to reset the wall.', 'error');
      return;
    }
    const confirmed = confirm('This will replace the current wall. A snapshot will be created first.');
    if (!confirmed) return;

    try {
      setSaveState('Resetting', 'Creating backup snapshot first...');
      const { wall, backupSnapshot } = await apiFetch('/reset', {
        backgroundMode: state.texture,
        currentPreviewImageData: generatePreview(0.32)
      });
      if (backupSnapshot) remoteSnapshots.unshift(mapRemoteSnapshot(backupSnapshot));
      loadRemotePayload(mapRemoteWall(wall), true);
      broadcastWallUpdate(mapRemoteWall(wall));
      await loadRemoteSnapshots();
      await loadAdminData();
      toast('Wall reset. Backup snapshot saved.');
    } catch (err) {
      toast(`Reset failed: ${err.message}`, 'error');
      setSaveState('Save failed', 'Reset did not complete');
    }
  }

  async function restoreSnapshotAsAdmin(snapshotId) {
    if (!currentUserIsAdmin) {
      toast('Admin access is required to restore snapshots.', 'error');
      return;
    }
    const snapshot = remoteSnapshots.find((item) => item.id === snapshotId) || adminData.snapshots.find((item) => item.id === snapshotId);
    const label = snapshot?.title || 'this snapshot';
    const confirmed = confirm(`Restore "${label}"? A backup snapshot of the current wall will be created first.`);
    if (!confirmed) return;

    try {
      setSaveState('Restoring', 'Creating backup snapshot first...');
      const { wall, backupSnapshot } = await apiFetch('/restore', {
        snapshotId,
        currentPreviewImageData: generatePreview(0.32)
      });
      if (backupSnapshot) remoteSnapshots.unshift(mapRemoteSnapshot(backupSnapshot));
      loadRemotePayload(mapRemoteWall(wall), true);
      broadcastWallUpdate(mapRemoteWall(wall));
      await loadRemoteSnapshots();
      await loadAdminData();
      toast('Snapshot restored. Current wall backup was saved.');
    } catch (err) {
      toast(`Restore failed: ${err.message}`, 'error');
      setSaveState('Save failed', 'Restore did not complete');
    }
  }

  async function deleteSnapshotAsAdmin(snapshotId) {
    if (!currentUserIsAdmin) {
      toast('Admin access is required to delete snapshots.', 'error');
      return;
    }
    if (!confirm('Delete this snapshot from the moderation archive?')) return;
    try {
      await apiFetch('/delete-snapshot', { snapshotId });
      remoteSnapshots = remoteSnapshots.filter((item) => item.id !== snapshotId);
      adminData.snapshots = adminData.snapshots.filter((item) => item.id !== snapshotId);
      renderSnapshots();
      renderAdminData();
      toast('Snapshot deleted.');
    } catch (err) {
      toast(`Snapshot delete failed: ${err.message}`, 'error');
    }
  }

  async function moderateSelectedObject(action) {
    if (!currentUserIsAdmin) {
      toast('Admin access is required for object moderation.', 'error');
      return;
    }
    const object = getSelectedModerationObject();
    if (!object) {
      toast('Select one canvas object first.', 'warn');
      return;
    }
    const confirmed = action === 'delete'
      ? confirm('Delete this object from the public wall? A backup snapshot will be created first.')
      : true;
    if (!confirmed) return;

    try {
      const { wall } = await apiFetch('/moderate-object', {
        objectId: object.objectId,
        action
      });
      loadRemotePayload(mapRemoteWall(wall), true);
      broadcastWallUpdate(mapRemoteWall(wall));
      await loadAdminData();
      toast(`Object ${action} complete.`);
    } catch (err) {
      toast(`Object moderation failed: ${err.message}`, 'error');
    }
  }

  async function loadAdminData() {
    if (!currentUserIsAdmin || !supabaseReady) {
      adminData = { reports: [], assets: [], logs: [], snapshots: [] };
      renderAdminData();
      return;
    }
    try {
      const data = await apiFetch('/admin-data', {}, { method: 'GET' });
      adminData = {
        reports: data.reports || [],
        assets: data.assets || [],
        logs: data.logs || [],
        snapshots: (data.snapshots || []).map(mapRemoteSnapshot)
      };
      remoteSnapshots = adminData.snapshots.slice(0, MAX_SNAPSHOTS);
      renderSnapshots();
      renderAdminData();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        currentUserIsAdmin = false;
        updateAuthUi();
      }
      toast(`Admin tools could not load: ${err.message}`, 'warn');
    }
  }

  function renderAdminData() {
    renderAdminSnapshots();
    renderReportQueue();
    renderAssetQueue();
    renderModerationLogs();
  }

  function renderAdminSnapshots() {
    if (!els.adminSnapshotList) return;
    if (!currentUserIsAdmin) {
      els.adminSnapshotList.innerHTML = '<div class="snapshot-empty">Admin login required.</div>';
      return;
    }
    if (!adminData.snapshots.length) {
      els.adminSnapshotList.innerHTML = '<div class="snapshot-empty">No snapshots yet.</div>';
      return;
    }
    els.adminSnapshotList.innerHTML = adminData.snapshots.map((snapshot) => `
      <div class="admin-mini-item">
        ${snapshot.imageUrl ? `<img src="${snapshot.imageUrl}" alt="${escapeHTML(snapshot.title)} preview" />` : ''}
        <strong>${escapeHTML(snapshot.title)}</strong>
        <span>${escapeHTML(formatTime(snapshot.createdAt))} ${snapshot.version ? `v${escapeHTML(snapshot.version)}` : ''}</span>
        <span>${escapeHTML(snapshot.reason || 'snapshot')}</span>
        <div class="admin-mini-actions">
          <button data-admin-restore="${escapeHTML(snapshot.id)}" type="button">Restore</button>
          <button data-admin-download="${escapeHTML(snapshot.id)}" type="button">Download</button>
          <button data-admin-delete-snapshot="${escapeHTML(snapshot.id)}" type="button">Delete</button>
        </div>
      </div>
    `).join('');
    $$('[data-admin-restore]', els.adminSnapshotList).forEach((button) => {
      button.addEventListener('click', async () => restoreSnapshotAsAdmin(button.dataset.adminRestore));
    });
    $$('[data-admin-download]', els.adminSnapshotList).forEach((button) => {
      button.addEventListener('click', () => {
        const snapshot = adminData.snapshots.find((item) => item.id === button.dataset.adminDownload);
        if (snapshot?.imageUrl) downloadDataUrl(snapshot.imageUrl, `${snapshot.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'wall-snapshot'}.jpg`);
      });
    });
    $$('[data-admin-delete-snapshot]', els.adminSnapshotList).forEach((button) => {
      button.addEventListener('click', async () => deleteSnapshotAsAdmin(button.dataset.adminDeleteSnapshot));
    });
  }

  function renderReportQueue() {
    if (!els.reportQueue) return;
    if (!currentUserIsAdmin) {
      els.reportQueue.innerHTML = '<div class="snapshot-empty">Admin login required.</div>';
      return;
    }
    if (!adminData.reports.length) {
      els.reportQueue.innerHTML = '<div class="snapshot-empty">No reports.</div>';
      return;
    }
    els.reportQueue.innerHTML = adminData.reports.map((report) => `
      <div class="admin-mini-item">
        <strong>${escapeHTML(report.reason)} - ${escapeHTML(report.status)}</strong>
        <span>${escapeHTML(formatTime(report.created_at))}${report.object_id ? ` - object ${escapeHTML(report.object_id)}` : ''}</span>
        ${report.comment ? `<p>${escapeHTML(report.comment)}</p>` : ''}
        <div class="admin-mini-actions">
          <button data-review-report="${escapeHTML(report.id)}" data-status="reviewed" type="button">Reviewed</button>
          <button data-review-report="${escapeHTML(report.id)}" data-status="resolved" type="button">Resolve</button>
          <button data-review-report="${escapeHTML(report.id)}" data-status="dismissed" type="button">Dismiss</button>
        </div>
      </div>
    `).join('');
    $$('[data-review-report]', els.reportQueue).forEach((button) => {
      button.addEventListener('click', async () => reviewReport(button.dataset.reviewReport, button.dataset.status));
    });
  }

  function renderAssetQueue() {
    if (!els.assetQueue) return;
    if (!currentUserIsAdmin) {
      els.assetQueue.innerHTML = '<div class="snapshot-empty">Admin login required.</div>';
      return;
    }
    if (!adminData.assets.length) {
      els.assetQueue.innerHTML = '<div class="snapshot-empty">No uploaded assets.</div>';
      return;
    }
    els.assetQueue.innerHTML = adminData.assets.map((asset) => `
      <div class="admin-mini-item">
        ${asset.public_url ? `<img src="${asset.public_url}" alt="Uploaded wall asset" />` : ''}
        <strong>${escapeHTML(asset.file_type || 'image')} - ${escapeHTML(asset.moderation_status || 'active')}</strong>
        <span>${escapeHTML(formatTime(asset.created_at))}${asset.hidden ? ' - hidden' : ''}</span>
        <div class="admin-mini-actions">
          ${asset.public_url ? `<a href="${asset.public_url}" target="_blank" rel="noreferrer">View</a>` : ''}
          <button data-delete-asset="${escapeHTML(asset.id)}" type="button">Delete</button>
        </div>
      </div>
    `).join('');
    $$('[data-delete-asset]', els.assetQueue).forEach((button) => {
      button.addEventListener('click', async () => deleteAssetAsAdmin(button.dataset.deleteAsset));
    });
  }

  function renderModerationLogs() {
    if (!els.moderationLogList) return;
    if (!currentUserIsAdmin) {
      els.moderationLogList.innerHTML = '<div class="snapshot-empty">Admin login required.</div>';
      return;
    }
    if (!adminData.logs.length) {
      els.moderationLogList.innerHTML = '<div class="snapshot-empty">No moderation logs yet.</div>';
      return;
    }
    els.moderationLogList.innerHTML = adminData.logs.map((log) => `
      <div class="admin-mini-item">
        <strong>${escapeHTML(log.action)}</strong>
        <span>${escapeHTML(formatTime(log.created_at))}${log.target_type ? ` - ${escapeHTML(log.target_type)}` : ''}</span>
      </div>
    `).join('');
  }

  async function reviewReport(reportId, status) {
    try {
      await apiFetch('/review-report', { reportId, status });
      await loadAdminData();
      toast('Report updated.');
    } catch (err) {
      toast(`Report update failed: ${err.message}`, 'error');
    }
  }

  async function deleteAssetAsAdmin(assetId) {
    if (!confirm('Delete this asset record and storage file? Canvas objects using it may need separate moderation.')) return;
    try {
      await apiFetch('/delete-asset', { assetId, deleteFile: true });
      await loadAdminData();
      toast('Asset deleted.');
    } catch (err) {
      toast(`Asset delete failed: ${err.message}`, 'error');
    }
  }

  async function renderInitialSnapshotsAndWall() {
    renderSnapshots();
    await loadWall(true);
    if (currentUserIsAdmin) await loadAdminData();
    updateEmptyState();
    updateMiniMapSoon();
  }

  function exposeRoomApi() {
    window.GBSPaintingRoom = {
      storageKey: WALL_KEY,
      snapshotKey: SNAPSHOT_KEY,
      get canvas() { return canvas; },
      get version() { return wallVersion; },
      get dirty() { return dirty; },
      get supabaseReady() { return supabaseReady; },
      setTool,
      save: () => saveWall(true),
      load: () => loadWall(true),
      uploadPaintingAsset,
      createSnapshot,
      subscribeToWallChanges,
      exportJson: () => getCurrentWallJson()
    };
  }

  async function init() {
    if (!window.fabric) {
      document.body.innerHTML = '<main class="section"><div class="container"><h1>Painting Room could not load</h1><p>Fabric.js is missing.</p></div></main>';
      return;
    }
    initDomRefs();
    initAgeGate();
    initNav();
    initCanvas();
    bindUi();
    renderPalettes();
    await initSupabasePersistence();
    await renderInitialSnapshotsAndWall();
    initRealtimeFallbacks();
    startPresence();
    exposeRoomApi();
    setTimeout(fitView, 120);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((err) => {
      markSupabaseUnavailable(err.message);
      loadWallLocal(true);
      toast('Painting Room started in local fallback mode.', 'error');
    });
  });
})();
