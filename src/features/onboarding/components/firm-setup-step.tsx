import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { firmSetupSchema, USER_COUNT_BANDS, type FirmSetupValues } from '@/features/onboarding/schemas'
import { COUNTRIES } from '@/features/onboarding/countries'
import { PRACTICE_AREAS } from '@/features/matters/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'

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
      legalName: '',
      country: 'Nigeria',
      timezone: GUESSED_TIMEZONE,
      website: '',
      industry: '',
      practiceAreas: [],
      ...defaultValues,
    },
  })

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
              <FormLabel>Firm name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Law Castle Firm" autoFocus {...field} />
              </FormControl>
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
                <Input placeholder="e.g. Law Castle Legal Practitioners LLP" {...field} />
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
                <FormLabel>Country</FormLabel>
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
                <FormLabel>Timezone</FormLabel>
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
                  <Input placeholder="https://" {...field} />
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
                <Input placeholder="e.g. Full-service law firm" {...field} />
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
