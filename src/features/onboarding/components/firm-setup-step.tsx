import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Globe } from 'lucide-react'
import { firmSetupSchema, slugify, USER_COUNT_BANDS, type FirmSetupValues } from '@/features/onboarding/schemas'
import { COUNTRIES } from '@/features/onboarding/countries'
import { PRACTICE_AREAS } from '@/features/matters/types'
import { Button } from '@/shared/components/ui/button'
import { HintInput } from '@/shared/components/hint-input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'

const TIMEZONES: string[] = (() => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone')
  } catch {
    // fall through to the curated list below
  }
  return ['UTC', 'Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London', 'America/New_York']
})()

const GUESSED_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
})()

/** Onboarding Step 2 — "Tell us about your firm." One screen, only 3 fields required. */
export function FirmSetupStep({
  defaultValues,
  onNext,
}: {
  defaultValues?: Partial<FirmSetupValues>
  onNext: (values: FirmSetupValues) => void
}) {
  const form = useForm<FirmSetupValues>({
    resolver: zodResolver(firmSetupSchema),
    defaultValues: {
      firmName: '',
      shortName: '',
      legalName: '',
      country: 'Nigeria',
      timezone: GUESSED_TIMEZONE,
      website: '',
      industry: '',
      practiceAreas: [],
      ...defaultValues,
    },
  })

  // Short name auto-follows the firm name until the user edits it directly —
  // same pattern as Platform Console's manual-creation slug field.
  const shortNameEdited = React.useRef(Boolean(defaultValues?.shortName))
  const onFirmNameChange = (value: string) => {
    form.setValue('firmName', value)
    if (!shortNameEdited.current) form.setValue('shortName', slugify(value), { shouldValidate: true })
  }
  const shortName = form.watch('shortName')

  const practiceAreas = form.watch('practiceAreas')
  const toggleArea = (area: string) => {
    const set = new Set(practiceAreas)
    if (set.has(area)) set.delete(area)
    else set.add(area)
    form.setValue('practiceAreas', [...set], { shouldDirty: true })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="firmName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Firm name<span className="text-destructive"> *</span></FormLabel>
              <FormControl>
                <HintInput
                  hint="A-Z"
                  placeholder="e.g. Law Castle Firm"
                  autoFocus
                  {...field}
                  onChange={(e) => onFirmNameChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shortName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Firm short name<span className="text-destructive"> *</span></FormLabel>
              <FormControl>
                <HintInput
                  hint="A-Z"
                  placeholder="shortname"
                  {...field}
                  onChange={(e) => {
                    shortNameEdited.current = true
                    field.onChange(e.target.value.toLowerCase())
                  }}
                />
              </FormControl>
              {shortName && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    {APP.domain}/w/<span className="font-medium text-primary">{shortName}</span>
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This becomes your workspace's web address — not a login email. You'll always sign in
                with your own email address.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="legalName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Legal name <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
              <FormControl>
                <HintInput hint="A-Z" placeholder="e.g. Law Castle Legal Practitioners LLP" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country<span className="text-destructive"> *</span></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone<span className="text-destructive"> *</span></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-64">
                    {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                <FormControl>
                  <HintInput hint="URL" placeholder="https://" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="userCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of users <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select a range" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {USER_COUNT_BANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="industry"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business / industry <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
              <FormControl>
                <HintInput hint="A-Z" placeholder="e.g. Full-service law firm" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium">Practice areas <span className="font-normal text-muted-foreground">(optional)</span></p>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_AREAS.map((area) => {
              const active = practiceAreas.includes(area)
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleArea(area)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {area}
                </button>
              )
            })}
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full">
          Continue
        </Button>
      </form>
    </Form>
  )
}
