import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    spinnerClassName?: string;
  }
>;

export function LoadingButton({
  loading = false,
  spinnerClassName = "",
  className = "",
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={loading || disabled}
      className={`${className} ${loading || disabled ? "opacity-60" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {loading ? <Loader2 size={16} className={`animate-spin ${spinnerClassName}`} /> : null}
        {children}
      </span>
    </button>
  );
}
