import { Component } from "react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { defaultSchema } from "rehype-sanitize";
import { cn } from "../utils/cn";

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input || []), "checked", "disabled", "type"],
    img: [...(defaultSchema.attributes?.img || []), "src", "alt"],
    a: [...(defaultSchema.attributes?.a || []), "href", "target", "rel"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
  },
};

interface MarkdownErrorBoundaryProps {
  children: ReactNode;
  rawContent: string;
}

interface MarkdownErrorBoundaryState {
  hasError: boolean;
}

export class MarkdownErrorBoundary extends Component<
  MarkdownErrorBoundaryProps,
  MarkdownErrorBoundaryState
> {
  constructor(props: MarkdownErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MarkdownErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 p-3 text-sm rounded-md"
            style={{ color: "#fbbf24", background: "rgba(251, 191, 36, 0.1)" }}
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Failed to render markdown preview. Showing raw content instead.</span>
          </div>
          <pre className="font-mono text-[13px] text-secondary whitespace-pre-wrap p-4 overflow-auto">
            {this.props.rawContent}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1
      className="text-primary first:mt-0"
      style={{ fontSize: "1.85em", fontWeight: 700, marginTop: "1.6em", marginBottom: "0.6em", letterSpacing: "-0.02em", lineHeight: 1.25 }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2
      className="text-primary pb-2 border-b border-border-subtle"
      style={{ fontSize: "1.45em", fontWeight: 600, marginTop: "1.8em", marginBottom: "0.6em", letterSpacing: "-0.015em", lineHeight: 1.3 }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3
      className="text-primary"
      style={{ fontSize: "1.2em", fontWeight: 600, marginTop: "1.6em", marginBottom: "0.5em", lineHeight: 1.35 }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4
      className="text-primary"
      style={{ fontSize: "1.05em", fontWeight: 600, marginTop: "1.4em", marginBottom: "0.4em", lineHeight: 1.4 }}
    >
      {children}
    </h4>
  ),
  h5: ({ children }: { children?: React.ReactNode }) => (
    <h5
      className="text-secondary"
      style={{ fontSize: "0.95em", fontWeight: 600, marginTop: "1.3em", marginBottom: "0.4em", lineHeight: 1.4, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}
    >
      {children}
    </h5>
  ),
  h6: ({ children }: { children?: React.ReactNode }) => (
    <h6
      className="text-tertiary"
      style={{ fontSize: "0.9em", fontWeight: 600, marginTop: "1.3em", marginBottom: "0.4em", lineHeight: 1.4, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}
    >
      {children}
    </h6>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-secondary" style={{ margin: "1.15em 0", lineHeight: "inherit" }}>{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-primary" style={{ fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ fontStyle: "italic" }}>{children}</em>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-primary"
      style={{ textDecoration: "underline", textDecorationColor: "var(--color-accent-primary)", textUnderlineOffset: "3px", textDecorationThickness: "1px" }}
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code
        className="font-mono rounded bg-tertiary text-primary"
        style={{ fontSize: "0.82em", padding: "0.15em 0.4em", fontWeight: 500 }}
        {...props}
      >
        {children}
      </code>
    ) : (
      <code className={cn("font-mono", className)} style={{ fontSize: "0.85em" }} {...props}>{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre
      className="font-mono rounded-lg overflow-x-auto bg-secondary border border-border-subtle"
      style={{ fontSize: "13px", lineHeight: 1.65, padding: "1em 1.25em", margin: "1.5em 0" }}
    >
      {children}
    </pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="text-secondary" style={{ listStyleType: "disc", paddingLeft: "1.5em", margin: "1em 0" }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="text-secondary" style={{ listStyleType: "decimal", paddingLeft: "1.5em", margin: "1em 0" }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ lineHeight: "inherit", marginTop: "0.35em", marginBottom: "0.35em", paddingLeft: "0.25em" }}>{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      className="text-secondary"
      style={{
        borderLeft: "3px solid var(--color-accent-primary)",
        paddingLeft: "1.2em",
        margin: "1.5em 0",
        fontStyle: "italic",
        opacity: 0.9,
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        height: "1px",
        background: "var(--color-border-default)",
        margin: "2.5em auto",
        maxWidth: "30%",
      }}
    />
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img
      src={src}
      alt={alt || ""}
      className="rounded-lg border border-border-subtle"
      style={{ maxWidth: "100%", margin: "1.5em 0" }}
    />
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto" style={{ margin: "1.5em 0" }}>
      <table className="border-collapse w-full" style={{ fontSize: "0.9em" }}>{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b-2 border-border">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-primary text-left" style={{ fontWeight: 600, padding: "0.6em 1em" }}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="text-secondary border-b border-border-subtle" style={{ padding: "0.6em 1em" }}>{children}</td>
  ),
  input: ({ type, checked, ...props }: { type?: string; checked?: boolean }) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-2 align-middle rounded accent-accent-primary"
          style={{ width: 14, height: 14 }}
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
  details: ({ children }: { children?: React.ReactNode }) => (
    <details className="my-2 border border-border-subtle rounded-md bg-secondary/20 p-2 text-primary marker:text-accent-primary">
      {children}
    </details>
  ),
  summary: ({ children }: { children?: React.ReactNode }) => (
    <summary className="cursor-pointer font-medium text-primary hover:text-accent-primary transition-colors focus:outline-none">
      {children}
    </summary>
  ),
};
