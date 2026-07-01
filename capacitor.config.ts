import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.notesapp.ios',
  appName: 'Notes',
  webDir: 'dist-mobile',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'always',
    scheme: 'Notes',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_notes',
      iconColor: '#ffd60a',
      sound: 'default',
    },
  },
}

export default config
