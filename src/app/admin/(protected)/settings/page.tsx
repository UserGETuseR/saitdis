import { getSiteSettings } from '@/lib/settings';
import { SettingsForm } from '@/components/admin/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getSiteSettings();
  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Настройки и контакты</h1>
      </div>
      <SettingsForm settings={settings} />
    </>
  );
}
