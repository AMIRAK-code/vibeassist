export function PageHeader({ title, description, children }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</header>;
}

export function Notice({ children }) {
  return <div className="notice">{children}</div>;
}

export function SampleBadge() {
  return <span className="badge">Sample data</span>;
}
