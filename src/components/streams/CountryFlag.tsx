// The flag pictures ship with the app (the MIT-licensed flag-icons set), so a visitor's browser contacts nobody else for
// them, and they are real images because Windows does not draw flag emoji. `?no-inline` keeps each one a small file of its
// own that the browser fetches only when a card shows it, instead of base64 text inside the app's JavaScript.
const FLAG_FILES = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
})

const FLAGS = new Map<string, string>(
  Object.entries(FLAG_FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url]),
)

interface CountryFlagProps {
  /** A two-letter flag code (`us`, `gb`). Anything else, and null, draws nothing. */
  code: string | null
  /** Width in pixels; the height keeps the 4 to 3 shape. */
  size?: number
}

/** A country's flag as a picture that carries no text of its own: the country is named in text next to it. */
export default function CountryFlag({ code, size = 20 }: CountryFlagProps) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null
  const lower = code.toLowerCase()
  // flag-icons keeps a grey "unknown" picture under xx; a stream with no known country should show no flag at all.
  const src = lower === 'xx' ? undefined : FLAGS.get(lower)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={Math.round((size * 3) / 4)}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="inline-block shrink-0 rounded-[2px] object-cover"
    />
  )
}
