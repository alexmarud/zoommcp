# Zoom MCP Server

MCP-сервер для управления Zoom-аккаунтом через Server-to-Server OAuth.

## Инструменты (Tools)

| Tool | Описание |
|------|----------|
| `create_meeting` | Создать конференцию (тема, время, длительность) |
| `list_meetings` | Список предстоящих встреч |
| `get_recordings` | Ссылки на скачивание записей конкретной встречи |
| `list_all_recordings` | Все записи за последние 30 дней |

## Настройка Zoom

1. Перейди на [Zoom Marketplace](https://marketplace.zoom.us/) → Develop → Build App
2. Создай **Server-to-Server OAuth** приложение
3. Скопируй **Account ID**, **Client ID**, **Client Secret**
4. Добавь scopes: `meeting:write:admin`, `meeting:read:admin`, `recording:read:admin`

## Локальный запуск

```bash
export ZOOM_ACCOUNT_ID=...
export ZOOM_CLIENT_ID=...
export ZOOM_CLIENT_SECRET=...

npm install
npm run build
npm start
```

Сервер запустится на `http://localhost:3000`.

## Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/health

# SSE endpoint (для MCP-клиентов)
curl -N http://localhost:3000/sse
```

## Деплой на Railway

1. Создай новый проект в [Railway](https://railway.app/)
2. Подключи этот репозиторий (или используй `railway up`)
3. Добавь переменные окружения:
   - `ZOOM_ACCOUNT_ID`
   - `ZOOM_CLIENT_ID`
   - `ZOOM_CLIENT_SECRET`
4. Railway автоматически соберёт проект через Dockerfile и назначит порт через `PORT`

## Подключение к Claude Desktop

```json
{
  "mcpServers": {
    "zoom": {
      "url": "https://<your-railway-domain>/sse"
    }
  }
}
```
