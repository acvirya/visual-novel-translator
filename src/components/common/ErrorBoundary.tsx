import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Copy, Check } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  private handleCopyError = () => {
    const errorText = `${this.state.error?.name || "Error"}: ${this.state.error?.message || "Unknown error"}\n\nStack Trace:\n${this.state.error?.stack || ""}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ""}`;
    navigator.clipboard.writeText(errorText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 24px",
            height: "100%",
            width: "100%",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            boxSizing: "border-box",
            textAlign: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "var(--accent-danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={26} />
          </div>

          <div style={{ maxWidth: "560px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
              {this.props.fallbackTitle || "Something went wrong in this view"}
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
              An unexpected runtime error occurred. You can attempt to reload this section without losing other app states.
            </p>
          </div>

          {this.state.error && (
            <div
              style={{
                width: "100%",
                maxWidth: "600px",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "12px",
                textAlign: "left",
                fontFamily: "monospace",
                fontSize: "11.5px",
                color: "var(--accent-danger)",
                maxHeight: "140px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {this.state.error.message}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={this.handleReset}
              className="btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "12.5px" }}
            >
              <RotateCcw size={14} />
              <span>Try Again</span>
            </button>

            <button
              onClick={this.handleCopyError}
              className="btn-secondary"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "12.5px" }}
            >
              {this.state.copied ? <Check size={14} style={{ color: "var(--accent-success)" }} /> : <Copy size={14} />}
              <span>{this.state.copied ? "Copied Error" : "Copy Details"}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
