const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Quotes one word for a POSIX shell (zsh, bash, sh).
 *
 * @param word - The word to quote.
 * @returns The word, single-quoted unless it only contains safe characters.
 */
export function quote(word: string): string {
  if (SAFE.test(word)) return word;
  return `'${word.replaceAll("'", `'\\''`)}'`;
}
