import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { STARTER_TEMPLATES } from '@/features/documents/lib/templates'
import type { Database } from '@/shared/types/database.types'

export type DocumentTemplate = Database['public']['Tables']['document_templates']['Row']
export interface TemplateInput { name: string; category: string | null; description: string | null; body: string }

const key = (org: string | null) => ['document-templates', org] as const

export function useDocumentTemplates(organizationId: string | null) {
  return useQuery({
    queryKey: key(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('document_templates').select('*').eq('organization_id', organizationId!).order('name')
      if (error) throw error
      return (data ?? []) as DocumentTemplate[]
    },
  })
}

export function useDocumentTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['document-template', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('document_templates').select('*').eq('id', id!).single()
      if (error) throw error
      return data as DocumentTemplate
    },
  })
}

export function useSaveTemplate(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...v }: TemplateInput & { id?: string }): Promise<string> => {
      if (id) {
        const { error } = await supabase.from('document_templates').update(v).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('document_templates').insert({ ...v, organization_id: organizationId! }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: key(organizationId) })
      qc.invalidateQueries({ queryKey: ['document-template', id] })
    },
  })
}

export function useDeleteTemplate(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('document_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(organizationId) }),
  })
}

/** Adds the built-in Nigerian starter set (skipping names the firm already has). */
export function useAddStarterTemplates(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (existing: string[]) => {
      const rows = STARTER_TEMPLATES.filter((t) => !existing.includes(t.name)).map((t) => ({ ...t, organization_id: organizationId! }))
      if (rows.length === 0) return 0
      const { error } = await supabase.from('document_templates').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(organizationId) }),
  })
}
