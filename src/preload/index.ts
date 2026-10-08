import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ClaptrapApi, Status } from '@shared/types'

const api: ClaptrapApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setApiKey: (provider, key) => ipcRenderer.invoke('settings:setApiKey', provider, key),
  listModels: (provider) => ipcRenderer.invoke('models:list', provider),
  testProvider: (provider) => ipcRenderer.invoke('models:test', provider),
  chooseNotesDir: () => ipcRenderer.invoke('settings:chooseNotesDir'),
  listRunningApps: () => ipcRenderer.invoke('apps:running'),

  getPermissions: () => ipcRenderer.invoke('permissions:get'),
  openPermissionPane: (kind) => ipcRenderer.invoke('permissions:open', kind),
  requestAccessibility: () => ipcRenderer.invoke('permissions:requestAccessibility'),
  requestScreenRecording: () => ipcRenderer.invoke('permissions:requestScreen'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),

  getStatus: () => ipcRenderer.invoke('status:get'),
  onStatus: (cb) => {
    const listener = (_e: IpcRendererEvent, status: Status) => cb(status)
    ipcRenderer.on('status', listener)
    return () => ipcRenderer.removeListener('status', listener)
  },
  openWindow: (route) => ipcRenderer.invoke('window:open', route),
  closeWindow: () => ipcRenderer.invoke('window:close')
}

contextBridge.exposeInMainWorld('claptrap', api)
