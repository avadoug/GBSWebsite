const { createClient } = require('@supabase/supabase-js');

const WALL_SLUG = 'main';
const STORAGE_BUCKET = 'painting-room-assets';

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

function getServiceClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw Object.assign(new Error('Missing server Supabase environment variables'), { statusCode: 500 });
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function readJson(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (err) {
    throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.statusCode = 204;
  res.end();
  return true;
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function getUser(req, supabase) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function requireUser(req, supabase) {
  const user = await getUser(req, supabase);
  if (!user) throw Object.assign(new Error('Login required'), { statusCode: 401 });
  return user;
}

async function isAdmin(supabase, userId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function requireAdmin(req, supabase) {
  const user = await requireUser(req, supabase);
  if (!(await isAdmin(supabase, user.id))) {
    throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
  }
  return user;
}

function getActorId(req, user, body) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return user?.id || body.sessionId || body.reporterSessionId || forwarded || 'anonymous';
}

async function enforceRateLimit(supabase, options) {
  const {
    bucket = 'painting-room',
    actorId,
    action,
    limit,
    windowSeconds
  } = options;
  const now = Date.now();
  const windowStartMs = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const windowStart = new Date(windowStartMs).toISOString();

  const { data, error } = await supabase
    .from('rate_limits')
    .select('id, count')
    .eq('bucket', bucket)
    .eq('actor_id', actorId)
    .eq('action', action)
    .eq('window_start', windowStart)
    .maybeSingle();

  if (error) throw error;
  if (data && data.count >= limit) {
    throw Object.assign(new Error('Rate limit exceeded. Try again later.'), { statusCode: 429 });
  }

  if (data) {
    const { error: updateError } = await supabase
      .from('rate_limits')
      .update({ count: data.count + 1, updated_at: new Date().toISOString() })
      .eq('id', data.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from('rate_limits')
    .insert({
      bucket,
      actor_id: actorId,
      action,
      count: 1,
      window_start: windowStart
    });
  if (insertError) throw insertError;
}

function emptyCanvasJson(backgroundMode = 'brick') {
  return {
    version: '5.3.0',
    objects: [],
    backgroundMode,
    tombstones: {}
  };
}

function normalizeCanvasJson(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.objects)) {
    return emptyCanvasJson(json?.backgroundMode || 'brick');
  }
  return {
    ...json,
    backgroundMode: json.backgroundMode || 'brick',
    tombstones: json.tombstones || {}
  };
}

async function getWall(supabase, createIfMissing = true) {
  const { data, error } = await supabase
    .from('painting_walls')
    .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
    .eq('slug', WALL_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (data || !createIfMissing) return data;

  const { data: created, error: createError } = await supabase
    .from('painting_walls')
    .insert({
      slug: WALL_SLUG,
      title: 'Painting Room',
      canvas_json: emptyCanvasJson()
    })
    .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
    .single();
  if (createError) throw createError;
  return created;
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/i.exec(dataUrl);
  if (!match) throw Object.assign(new Error('Invalid image data'), { statusCode: 400 });
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function uploadDataUrl(supabase, dataUrl, filePath, upsert = false) {
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed) return '';
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, parsed.buffer, {
      contentType: parsed.mime,
      cacheControl: '3600',
      upsert
    });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return upsert ? `${data.publicUrl}?v=${Date.now()}` : data.publicUrl;
}

async function createSnapshotFromWall(supabase, wall, options = {}) {
  const {
    title = 'Wall backup',
    reason = 'backup',
    actorUserId = null,
    imageData = '',
    imageUrl = ''
  } = options;
  let finalImageUrl = imageUrl || wall.preview_image_url || '';
  if (imageData) {
    finalImageUrl = await uploadDataUrl(
      supabase,
      imageData,
      `${WALL_SLUG}/snapshots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    );
  }
  const { data, error } = await supabase
    .from('painting_snapshots')
    .insert({
      wall_id: wall.id,
      title,
      image_url: finalImageUrl || null,
      canvas_json: normalizeCanvasJson(wall.canvas_json),
      wall_version: wall.version,
      created_by: actorUserId,
      reason
    })
    .select('id, wall_id, title, image_url, canvas_json, wall_version, created_by, reason, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function logModeration(supabase, wallId, actorUserId, action, targetType, targetId, details = {}) {
  const { error } = await supabase.from('moderation_logs').insert({
    wall_id: wallId,
    actor_user_id: actorUserId || null,
    action,
    target_type: targetType || null,
    target_id: targetId || null,
    details
  });
  if (error) throw error;
}

function findCanvasObject(objects, objectId) {
  for (const object of objects || []) {
    if (object.objectId === objectId) return object;
    const nested = findCanvasObject(object.objects, objectId);
    if (nested) return nested;
  }
  return null;
}

function removeCanvasObject(objects, objectId) {
  if (!Array.isArray(objects)) return false;
  const index = objects.findIndex((object) => object.objectId === objectId);
  if (index >= 0) {
    objects.splice(index, 1);
    return true;
  }
  return objects.some((object) => removeCanvasObject(object.objects, objectId));
}

async function withHandler(req, res, allowedMethods, callback) {
  if (handleOptions(req, res)) return;
  if (!allowedMethods.includes(req.method)) {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  try {
    const supabase = getServiceClient();
    const body = await readJson(req);
    await callback({ req, res, supabase, body });
  } catch (err) {
    sendJson(res, err.statusCode || 500, { error: err.message || 'Server error' });
  }
}

module.exports = {
  WALL_SLUG,
  STORAGE_BUCKET,
  emptyCanvasJson,
  normalizeCanvasJson,
  getServiceClient,
  readJson,
  sendJson,
  getUser,
  requireUser,
  requireAdmin,
  isAdmin,
  getActorId,
  enforceRateLimit,
  getWall,
  uploadDataUrl,
  createSnapshotFromWall,
  logModeration,
  findCanvasObject,
  removeCanvasObject,
  withHandler
};
