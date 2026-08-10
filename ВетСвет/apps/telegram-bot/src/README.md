# Telegram Bot boundary

Bot token is read only on the server from `TELEGRAM_BOT_TOKEN`. It is never copied into source, a web bundle, logs, tests or Git.

The bot is not a CRM and does not own owner/pet history. It will authenticate Telegram identity safely, then call the same official application API as Client Web and Staff App. Webhook signature/secret validation, raw-event storage, deduplication and asynchronous processing are mandatory before production activation.
