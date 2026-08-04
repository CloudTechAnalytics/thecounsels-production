import { supabase } from '@/shared/lib/supabase'
import type { Profile } from '@/shared/types/database.types'

export const settingsService = {
  async updateProfile(userId: string, patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'title'>>): Promise<void> {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) throw error
  },

  /** Mirrors staff.service's uploadAvatar — same bucket, same set_avatar RPC, self-scoped. */
  async uploadAvatar(userId: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = pub.publicUrl
    const { error } = await supabase.rpc('set_avatar', { p_user: userId, p_url: url })
    if (error) throw error
    return url
  },
}
