import { invoke } from "@tauri-apps/api/core";

const SERVICE = "sybyl-standalone";

export async function keychainSet(account: string, secret: string): Promise<void> {
  await invoke("keychain_set", { service: SERVICE, account, secret });
}

export async function keychainGet(account: string): Promise<string | null> {
  const result = await invoke<string | null>("keychain_get", { service: SERVICE, account });
  return result ?? null;
}

export async function keychainDelete(account: string): Promise<void> {
  await invoke("keychain_delete", { service: SERVICE, account });
}
