// Type declarations for `react-syntax-highlighter` — the package ships no
// bundled types and we deliberately avoid pulling in @types/* to keep the
// dependency surface small for OSS contributors. The shapes below cover
// exactly the API surface MindGuide uses (Prism-based highlighting with a
// named style export).

declare module 'react-syntax-highlighter' {
  import type { ComponentType, ReactNode } from 'react';
  export interface SyntaxHighlighterProps {
    language?: string;
    style?: Record<string, React.CSSProperties>;
    customStyle?: React.CSSProperties;
    children?: ReactNode;
    [key: string]: unknown;
  }
  const Prism: ComponentType<SyntaxHighlighterProps>;
  export default Prism;
  export { Prism };
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  const styles: Record<string, Record<string, React.CSSProperties>>;
  export const oneDark: Record<string, React.CSSProperties>;
  export const oneLight: Record<string, React.CSSProperties>;
  export const vscDarkPlus: Record<string, React.CSSProperties>;
  export default styles;
}
