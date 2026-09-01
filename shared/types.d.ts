// Ambient declarations for third-party CommonJS dependencies that ship no
// types of their own. Each declares only the members this plugin actually
// calls (verified against the installed package source), not the library's
// full API surface.

declare module "@serverless/utils/log" {
  export function writeText(text: string): void;
  export const style: {
    aside(text: string): string;
  };
}
