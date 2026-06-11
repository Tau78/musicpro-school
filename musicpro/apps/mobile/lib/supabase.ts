import { createMobileClient } from "@musicpro/database";
import * as SecureStore from "expo-secure-store";

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export function createClient() {
  return createMobileClient({ storage: secureStoreAdapter });
}
