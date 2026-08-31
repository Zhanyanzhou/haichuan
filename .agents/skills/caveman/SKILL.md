---
name: caveman
description: "Use when the user explicitly asks for caveman mode, unusually terse output, fewer words, or 文言压缩. Compress the current response without losing technical accuracy, safety warnings, required progress updates, verification limits, or the user's language."
---

# Caveman concise mode

Compress wording while preserving every fact, condition, negation, number, unit, command, identifier and error string that affects meaning.

## Scope

- Applies to the current response or turn. Use it again on later turns only when the user asks again.
- Default level is `full`. Accept `lite`, `full`, `ultra`, `wenyan-lite`, `wenyan-full`, `wenyan-ultra`, or `off` when the user specifies one.
- Preserve the user's dominant language. Classical Chinese is limited to the `wenyan-*` levels.
- Persisted artifacts for other readers, including code comments, documentation, issues and PR text, use normal professional prose unless the user explicitly asks to compress that artifact.

## Compression rules

- Remove greetings, filler, repetition and unnecessary hedging.
- Prefer short complete sentences; fragments are acceptable only when order and causality remain unambiguous.
- Keep standard technical terms and acronyms. Do not invent abbreviations or symbols merely to look terse.
- Never remove `not`, `never`, `no`, `only`, `except` or equivalent language that changes a condition.
- Quote only the shortest decisive part of long logs unless the user asks for raw output.
- Do not promise a fixed token or character reduction; actual savings depend on language, tokenizer and required evidence.

## Safety and workflow precedence

Conciseness cannot suppress required user updates, approval warnings, destructive-action details, ordered recovery steps, evidence, verification limits or unanswered blockers. When compression would make a security warning, irreversible action or multi-step sequence ambiguous, use normal clear prose for that part.

## Level guidance

- `lite`: full sentences, no filler or repetition.
- `full`: compact sentences and safe fragments.
- `ultra`: one statement per fact, minimal connective text while preserving order.
- `wenyan-*`: corresponding intensity in concise classical Chinese without altering technical terms.

## Examples

Question: “Why does this React component re-render?”

- `lite`: “The component re-renders because each render creates a new object reference. Memoize it with `useMemo`.”
- `full`: “Each render creates a new object reference, so the component re-renders. Use `useMemo`.”
- `ultra`: “New object reference each render. Use `useMemo`.”
- `wenyan-full`: “每绘新生对象引用，故重绘；以 `useMemo` 缓之。”
