import { autoUpdater } from 'electron-updater';

export type UpdateChannel = 'latest' | 'beta';

export function setUpdateChannel(channel: UpdateChannel): void {
  autoUpdater.channel = channel;
}

export function getUpdateChannel(): UpdateChannel {
  return (autoUpdater.channel as UpdateChannel) ?? 'latest';
}
