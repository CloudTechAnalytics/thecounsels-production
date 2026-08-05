import * as React from 'react'
import { Input } from '@/shared/components/ui/input'

/** Free-text category with autocomplete — pick a suggestion or type a custom
 * one. An empty value means "Uncategorised"; there's no separate sentinel. */
export function CategoryInput({
  value,
  onChange,
  suggestions,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
}) {
  const listId = React.useId()
  return (
    <>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        placeholder="Uncategorised"
        maxLength={60}
      />
      <datalist id={listId}>
        {suggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  )
}
