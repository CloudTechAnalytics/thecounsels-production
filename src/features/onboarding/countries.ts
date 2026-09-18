/** Firm-setup step's country list — Nigeria first (primary market), then
 * heavily weighted toward the rest of Africa (product is being sold
 * continent-wide, not just in the anglophone/common-law markets the old,
 * shorter list implied), with only a handful of non-African markets at
 * the end for firms/clients based elsewhere. "Other" always stays last —
 * see the free-text fallback wired up in firm-setup-step.tsx, required
 * when picked, never left as the literal stored value. Not exhaustive by
 * design, but deliberately broader than before. */
export const COUNTRIES = [
  'Nigeria',

  // West Africa
  'Ghana',
  'Sierra Leone',
  'Liberia',
  'Senegal',
  'Côte d’Ivoire',
  'Togo',
  'Benin',
  'Guinea',
  'Guinea-Bissau',
  'Gambia',
  'Mali',
  'Burkina Faso',
  'Niger',
  'Cabo Verde',

  // East Africa
  'Kenya',
  'Tanzania',
  'Uganda',
  'Rwanda',
  'Ethiopia',
  'Burundi',
  'South Sudan',
  'Somalia',
  'Djibouti',

  // Southern Africa
  'South Africa',
  'Zimbabwe',
  'Zambia',
  'Botswana',
  'Namibia',
  'Mozambique',
  'Malawi',
  'Lesotho',
  'Eswatini',

  // North Africa
  'Egypt',
  'Morocco',
  'Tunisia',
  'Algeria',
  'Libya',
  'Sudan',

  // Central Africa
  'Cameroon',
  'Democratic Republic of the Congo',
  'Republic of the Congo',
  'Gabon',
  'Chad',
  'Central African Republic',
  'Equatorial Guinea',

  // Rest of world — a short list, firms/clients based outside Africa
  'United Kingdom',
  'United States',
  'Canada',
  'United Arab Emirates',
  'India',

  'Other',
] as const
