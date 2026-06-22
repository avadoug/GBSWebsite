const {
  enforceRateLimit,
  getWall,
  requireUser,
  sendJson,
  uploadDataUrl,
  withHandler
} = require('../_painting');

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function sanitizeFileName(name) {
  return String(name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'image';
}

function getMimeFromDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,/i.exec(String(dataUrl || ''));
  return match ? match[1].toLowerCase() : '';
}

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const user = await requireUser(req, supabase);
    await enforceRateLimit(supabase, {
      actorId: user.id,
      action: 'upload',
      limit: 10,
      windowSeconds: 60 * 60
    });

    const mime = getMimeFromDataUrl(body.imageData);
    if (!EXT_BY_MIME[mime]) {
      throw Object.assign(new Error('Use PNG, JPG, WebP, or GIF images only.'), { statusCode: 400 });
    }

    const wall = await getWall(supabase, true);
    const safeName = sanitizeFileName(body.fileName || 'imported-art');
    const filePath = `main/imports/${user.id}/${Date.now()}-${safeName}.${EXT_BY_MIME[mime]}`;
    const publicUrl = await uploadDataUrl(supabase, body.imageData, filePath, false);

    const { data: asset, error } = await supabase
      .from('painting_assets')
      .insert({
        wall_id: wall.id,
        file_path: filePath,
        public_url: publicUrl,
        width: Math.round(Number(body.width) || 0) || null,
        height: Math.round(Number(body.height) || 0) || null,
        file_type: mime,
        created_by: user.id
      })
      .select('id, wall_id, file_path, public_url, width, height, file_type, created_by, moderation_status, hidden, deleted_at, created_at')
      .single();

    if (error) throw error;
    sendJson(res, 200, { asset, url: publicUrl, filePath });
  });
};
