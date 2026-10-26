export type OpenAiAuthMethod = "api_key" | "oauth";

export interface OpenAiAuthStatus {
  authMethod: OpenAiAuthMethod;
  selectedAccountId: string | null;
  accounts: Array<{ id: string; email: string | null; connected: boolean }>;
  pending: boolean;
  error: string | null;
}

export function hasConnectedOpenAiAccount(status: OpenAiAuthStatus): boolean {
  return status.accounts.some(account => account.id === status.selectedAccountId && account.connected);
}
