import { supabase } from '@/integrations/supabase/client';

export async function uploadMapStickerDataUrl(
  userId: string,
  dataUrl: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const path = `${userId}/${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage
      .from('map-stickers')
      .upload(path, blob, { contentType: 'image/png', upsert: false });
    if (error) {
      console.warn('Sticker upload failed; keeping inline image:', error.message);
      return null;
    }
    const { data } = supabase.storage.from('map-stickers').getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl, path } : null;
  } catch (error) {
    console.warn('Sticker upload failed; keeping inline image:', error);
    return null;
  }
}
