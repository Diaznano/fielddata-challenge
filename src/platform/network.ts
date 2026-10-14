import * as Network from 'expo-network';

function reachable(state: Network.NetworkState): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

export async function isOnline(): Promise<boolean> {
  return reachable(await Network.getNetworkStateAsync());
}

export function subscribeOnline(callback: (online: boolean) => void): () => void {
  const subscription = Network.addNetworkStateListener((state) => callback(reachable(state)));
  return () => subscription.remove();
}
