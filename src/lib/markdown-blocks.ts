// Splits streaming markdown into top-level blocks so already-finished blocks can be memoized and
// only the last block is re-parsed per delta (docs/phase3/05-streaming-protocol.md).
//
// Trade-offs (deliberate): blocks are separated at blank lines outside code fences. To keep rendering
// identical to parsing the whole text we MERGE chunks that belong together:
//   - a chunk that starts with indentation (list-item continuation / indented code)
//   - consecutive list items separated by blank lines ("loose" lists), so numbering stays correct
// Not handled: reference-style link definitions that appear in a later block than their use.

// CommonMark: a backtick fence's info string may not contain a backtick (so "```a```" is inline code).
// Must stay in agreement with the opening-fence rule in artifacts.ts.
const FENCE_OPEN = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])\s/;

export function splitBlocks(text: string): string[] {
  if (text === "") return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const chunks: string[][] = [];
  let current: string[] = [];
  let fence: { char: string; len: number } | null = null;

  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = [];
  };

  for (const line of lines) {
    if (fence) {
      current.push(line);
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.len) fence = null;
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      fence = { char: open[1]![0]!, len: open[1]!.length };
      current.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  // Merge chunks that must stay together to render the same as the whole document.
  const merged: string[][] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    const first = chunk[0]!;
    const indented = /^( {2,}|\t)/.test(first);
    const bothLists = prev !== undefined && LIST_ITEM.test(prev[0]!) && LIST_ITEM.test(first);
    if (prev && (indented || bothLists)) {
      prev.push("", ...chunk);
    } else {
      merged.push([...chunk]);
    }
  }
  return merged.map((c) => c.join("\n"));
}
