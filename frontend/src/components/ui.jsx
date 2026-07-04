import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

const toneClasses = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
};

const alertStyles = {
  info: {
    icon: Info,
    className: 'border-blue-200 bg-blue-50 text-blue-800',
    iconClassName: 'text-blue-600',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    iconClassName: 'text-emerald-600',
  },
  warning: {
    icon: AlertCircle,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    iconClassName: 'text-amber-600',
  },
  error: {
    icon: AlertCircle,
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    iconClassName: 'text-rose-600',
  },
};

export function PageHeader({ title, description, eyebrow, meta, actions }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Surface({ children, className = '', padding = 'p-5' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${padding} ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeading({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
            <Icon size={18} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, caption, tone = 'blue' }) {
  const toneClass = toneClasses[tone] || toneClasses.blue;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-normal text-slate-900">{value}</p>
          {caption && <p className="mt-2 text-sm leading-5 text-slate-500">{caption}</p>}
        </div>
        {Icon && (
          <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
            <Icon size={22} />
          </span>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ children, tone = 'slate', className = '' }) {
  const toneClass = toneClasses[tone] || toneClasses.slate;

  return (
    <span className={`inline-flex whitespace-nowrap items-center rounded-md border px-2.5 py-1 text-xs font-bold ${toneClass} ${className}`}>
      {children}
    </span>
  );
}

export function AlertMessage({ type = 'info', title, children, className = '' }) {
  const style = alertStyles[type] || alertStyles.info;
  const Icon = style.icon;

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${style.className} ${className}`}>
      <Icon className={`mt-0.5 flex-shrink-0 ${style.iconClassName}`} size={18} />
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 leading-5' : 'leading-5'}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title = 'No data found yet.', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
        <Icon size={20} />
      </span>
      <p className="font-bold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ text = 'Loading data...' }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
      <Loader2 className="animate-spin" size={18} />
      {text}
    </div>
  );
}


const buttonTones = {
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-200',
  secondary: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-200',
  danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus:ring-rose-200',
};

export function ActionButton({ children, icon: Icon, tone = 'primary', className = '', ...props }) {
  const toneClass = buttonTones[tone] || buttonTones.primary;
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 disabled:pointer-events-none disabled:opacity-60 ${toneClass} ${className}`}
      {...props}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}

export function FormField({ id, label, helper, error, children }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
          {label}
        </label>
      )}
      {children}
      {helper && !error && <p className="mt-1.5 text-xs leading-5 text-slate-500">{helper}</p>}
      {error && <p className="mt-1.5 text-xs font-semibold leading-5 text-rose-600">{error}</p>}
    </div>
  );
}

export function FormSection({ title, description, children, className = '' }) {
  return (
    <Surface className={className}>
      {(title || description) && (
        <div className="mb-5">
          {title && <h2 className="text-lg font-black text-slate-900">{title}</h2>}
          {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </Surface>
  );
}

export function ErrorState({ title = 'Something went wrong.', description, action }) {
  return <EmptyState icon={AlertCircle} title={title} description={description} action={action} />;
}

export function ResponsiveTable({ headers, children, mobileCards, emptyState }) {
  const isEmpty = !children && !mobileCards;
  if (isEmpty) {
    return emptyState || null;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          {headers && (
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                {headers.map((header) => (
                  <th key={header} className="px-5 py-4">{header}</th>
                ))}
              </tr>
            </thead>
          )}
          {children}
        </table>
      </div>
      <div className="space-y-3 md:hidden">{mobileCards}</div>
    </>
  );
}

export function MobileDataCard({ title, subtitle, meta, children, actions }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-slate-900">{title}</h3>
          {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
        </div>
        {meta && <div className="flex-shrink-0">{meta}</div>}
      </div>
      {children && <div className="mt-3 space-y-2 text-sm text-slate-600">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}
