/**
 * What is said about counting, in plain sentences (see the block in index.html and src/lib/analytics.ts). The first is only true
 * while Matomo's IP masking is on (Matomo admin, Privacy, Anonymize data).
 */
export const COUNTED_NOTE =
  'Visits, and what is played or linked, are counted by Matomo on my own server, with no cookies and shortened IP addresses.'

/** For a visitor Matomo does not count (Do Not Track, Global Privacy Control): PRISM's own counter still counts page opens. */
export const UNCOUNTED_NOTE = 'Page opens are counted, with nothing about you.'
