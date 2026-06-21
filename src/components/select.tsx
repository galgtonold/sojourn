import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

// A native <select> dressed to match the site's inputs: the OS chevron and
// control chrome are dropped (appearance-none) for our own ChevronDown, and the
// option list is darkened so it doesn't flash as a white OS menu. Width and the
// rest of the look come from `className` (so it can be a full-width field or a
// compact pill); `wrapperClassName` styles the positioning box (e.g. spacing).
export function Select({
  className = "",
  wrapperClassName = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select
        {...props}
        // `!pr-9` always wins over the caller's padding so the chevron never
        // overlaps the text, whatever `className` sets.
        className={`appearance-none !pr-9 [&>option]:bg-ink-900 [&>option]:text-sand-100 ${className}`}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-sand-100/50"
      />
    </div>
  );
}
