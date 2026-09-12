import { useCallback, useRef, useState } from "react";
import { registerPendingCommittedInput, unregisterPendingCommittedInput } from "../inspector/controls/NumberField";

export interface CanvasInlineTextEditorProps {
  value: string;
  label?: string;
  onChange: (value: string) => void;
  onCommit: () => boolean;
  onCancel: () => void;
}

/** 复用属性输入的提交门禁：失败保留输入，合法提交或取消才允许离开。 */
export default function CanvasInlineTextEditor({ value, label, onChange, onCommit, onCancel }: CanvasInlineTextEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const finishedRef = useRef(false);
  const committingRef = useRef(false);
  const commitRef = useRef<() => boolean>(() => true);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (finishedRef.current || committingRef.current) return true;
    committingRef.current = true;
    try {
      const ok = onCommit();
      finishedRef.current = ok;
      setInvalid(!ok);
      // 门禁在同一事件里读取此属性，不能等待 React 下一次渲染。
      if (ok) inputRef.current?.removeAttribute("aria-invalid");
      else inputRef.current?.setAttribute("aria-invalid", "true");
      return ok;
    } finally { committingRef.current = false; }
  };
  commitRef.current = commit;
  const attachInput = useCallback((input: HTMLTextAreaElement | null) => {
    if (inputRef.current) unregisterPendingCommittedInput(inputRef.current);
    inputRef.current = input;
    if (input) registerPendingCommittedInput(input, () => commitRef.current());
  }, []);
  return <textarea ref={attachInput} autoFocus className="template-editor__inline-text"
    aria-label={label ?? "画布文字试排（仅本次编辑）"} aria-invalid={invalid || undefined}
    data-committed-text-input="true" value={value}
    onChange={(event) => { finishedRef.current = false; setInvalid(false); inputRef.current?.removeAttribute("aria-invalid"); onChange(event.target.value); }}
    onBlur={() => { commit(); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        finishedRef.current = true;
        inputRef.current?.removeAttribute("aria-invalid");
        onCancel();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
    }} />;
}
