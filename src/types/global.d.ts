declare global {
  interface Window {
    /**
     * Navigate to the auth page with a custom redirect URL
     * @param redirectUrl - URL to redirect to after successful authentication
     */
    navigateToAuth: (redirectUrl: string) => void;
  }
}

declare module "mammoth" {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: any): Promise<{ value: string; messages: any[] }>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: any[] }>;
}

export {};