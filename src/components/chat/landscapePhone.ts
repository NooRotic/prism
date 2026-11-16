/**
 * The one definition of "a phone held sideways". Height, not width: a landscape phone is
 * 670-930px wide, which a width rule cannot tell from a small desktop window, but it is
 * never more than about 430px tall. A desktop window resized this short gets the same
 * layout on purpose.
 *
 * index.css repeats this string in its own @media blocks (CSS cannot import it); a test
 * pins the two together.
 */
export const LANDSCAPE_PHONE_QUERY = '(orientation: landscape) and (max-height: 500px)'
