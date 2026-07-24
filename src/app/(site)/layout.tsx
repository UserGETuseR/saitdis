import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { MobileCartBar } from '@/components/cart/MobileCartBar';
import { getSiteSettings } from '@/lib/settings';
import { getMenu } from '@/lib/catalog';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, menu] = await Promise.all([getSiteSettings(), getMenu()]);
  const navCategories = menu.map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <>
      <a href="#menu" className="skip-link">
        Перейти к меню
      </a>
      <Header
        phoneDisplay={settings.contactPhoneDisplay}
        phoneRaw={settings.contactPhoneRaw}
        workingHours={settings.workingHours}
        categories={navCategories}
      />
      <main id="main">{children}</main>
      <Footer settings={settings} />
      <CartDrawer />
      <MobileCartBar />
    </>
  );
}
