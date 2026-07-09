import Link from "next/link";

export default function PageErrorState({
  title,
  message,
  primaryHref = "/",
  primaryLabel = "Go home",
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  message: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="card">
      <div className="page-error">
        <div className="page-error-eyebrow">Unable to load</div>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="page-error-actions">
          <Link href={primaryHref} className="btn">
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link href={secondaryHref} className="btn ghost">
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
