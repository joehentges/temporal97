import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 gap-6 max-w-2xl mx-auto px-4">
      <div>
        <h1 className="text-4xl font-bold mb-3">temporal97</h1>
        <p className="text-fd-muted-foreground text-lg">
          A TypeScript temporal graph with snapshot-based time travel and
          mutation history tracking.
        </p>
      </div>
      <div className="flex gap-3 justify-center flex-wrap">
        <Link
          href="/docs/getting-started"
          className="bg-fd-primary text-fd-primary-foreground px-5 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
        >
          Get Started
        </Link>
        <Link
          href="/docs/api-reference"
          className="border border-fd-border px-5 py-2 rounded-md font-medium hover:bg-fd-accent transition-colors"
        >
          API Reference
        </Link>
      </div>
      <pre className="text-left bg-fd-card border border-fd-border rounded-lg px-5 py-4 text-sm text-fd-muted-foreground">
        <span className="text-fd-foreground">npm install temporal97</span>
      </pre>
    </div>
  );
}
