import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <NativeTabs
      backgroundColor={theme.surface}
      indicatorColor={theme.primarySoft}
      labelStyle={{ selected: { color: theme.primary } }}
      iconColor={{ selected: theme.primary }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Beranda</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>Riwayat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="receipt_long" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pockets">
        <NativeTabs.Trigger.Label>Kantong</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wallet.pass" md="account_balance_wallet" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Pengaturan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
