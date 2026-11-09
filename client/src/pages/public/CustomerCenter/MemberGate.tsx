import { useState, type ReactNode } from "react";
import "./AccountExperience.css";

export function MemberGate({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="account-page account-page--guest">
      <div className="member-gate">
        <section className="member-access">
          <header className="member-access__intro">
            <p className="member-kicker">{kicker}</p>
            <h1>{title}</h1>
            {lede ? <div className="member-access__lede">{lede}</div> : null}
          </header>
          {children}
        </section>
      </div>
    </div>
  );
}

export function RevealPasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  required,
  disabled,
  autoFocus,
  name,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="member-field__control">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="member-field__reveal"
        aria-pressed={visible}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "隐藏" : "显示"}
      </button>
    </span>
  );
}
