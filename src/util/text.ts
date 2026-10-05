/** Remove ANSI/OSC escape sequences and C0/C1 control characters (keeps tab and newline when asked). */
export function stripControl(s: string, keepNewlines = false): string {
  const esc = String.fromCharCode(27);
  let out = s.split(`${esc}[`).join('').split(`${esc}]`).join('');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitiser
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
  if (!keepNewlines) out = out.replace(/[\r\n\t]+/g, ' ');
  return out;
}

/** Make a string safe inside a markdown table cell or a single line of a GitHub comment. */
export function markdownCell(s: string): string {
  return stripControl(s)
    .replace(/\|/g, '\\|')
    .replace(/@/g, '@\u200b')
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
}

/** Redact secret-looking tokens from free text (provider error bodies, notes). */
export function redactSecrets(s: string): string {
  return s.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[0-9A-Za-z-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/g,
    '[redacted]',
  );
}
