const {
  getWall,
  logModeration,
  requireAdmin,
  sendJson,
  STORAGE_BUCKET,
  withHandler
} = require('../_painting');

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const admin = await requireAdmin(req, supabase);
    if (!body.assetId) {
      throw Object.assign(new Error('assetId is required'), { statusCode: 400 });
    }
    const wall = await getWall(supabase, true);
    const { data: asset, error: assetError } = await supabase
      .from('painting_assets')
      .select('id, wall_id, file_path, public_url')
      .eq('id', body.assetId)
      .single();
    if (assetError) throw assetError;

    if (body.deleteFile && asset.file_path) {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([asset.file_path]);
      if (storageError) throw storageError;
    }

    const { error } = await supabase
      .from('painting_assets')
      .update({
        moderation_status: 'deleted',
        hidden: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', body.assetId);
    if (error) throw error;

    await logModeration(supabase, wall.id, admin.id, 'delete_asset', 'painting_asset', asset.id, {
      filePath: asset.file_path,
      deleteFile: Boolean(body.deleteFile)
    });
    sendJson(res, 200, { ok: true });
  });
};
