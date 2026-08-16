// ===== Конфигурация «Чайной истории» =====
// Единая точка переключения окружения. Сейчас приложение работает локально
// (localStorage). Когда подключишь Supabase — поменяй backend на 'supabase'
// и впиши ключи проекта (см. supabase/schema.sql и assets/js/db.supabase.js).

window.CHA_CONFIG = {
  backend: "local",            // 'local' | 'supabase'
  supabaseUrl: "",             // https://xxxx.supabase.co
  supabaseAnonKey: "",         // публичный anon-ключ
  tenantId: null,              // id чайной (для мультиаренды)
  appVersion: "12",
};
