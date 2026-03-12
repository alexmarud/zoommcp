# Zoom MCP Server

MCP-сервер для полного управления Zoom-аккаунтом через Server-to-Server OAuth.

## Инструменты (27 tools)

### Meetings
| Tool | Описание |
|------|----------|
| `create_meeting` | Создать конференцию |
| `get_meeting` | Информация о встрече |
| `update_meeting` | Изменить встречу |
| `delete_meeting` | Удалить встречу |
| `list_meetings` | Список встреч (upcoming/live/past) |
| `add_meeting_registrant` | Зарегистрировать участника |

### Participants
| Tool | Описание |
|------|----------|
| `list_meeting_participants` | Участники прошедшей встречи |

### Recordings & Transcripts
| Tool | Описание |
|------|----------|
| `list_all_recordings` | Все записи (настраиваемый период) |
| `get_recordings` | Записи конкретной встречи |
| `get_recording_transcript` | Скачать транскрипт (VTT) |
| `delete_recording` | Удалить запись (в корзину или навсегда) |
| `recover_recording` | Восстановить запись из корзины |

### Users
| Tool | Описание |
|------|----------|
| `list_users` | Список пользователей аккаунта |
| `get_user` | Информация о пользователе |

### Webinars
| Tool | Описание |
|------|----------|
| `create_webinar` | Создать вебинар |
| `list_webinars` | Список вебинаров |
| `get_webinar` | Информация о вебинаре |
| `delete_webinar` | Удалить вебинар |
| `list_webinar_participants` | Участники прошедшего вебинара |

### Chat
| Tool | Описание |
|------|----------|
| `list_channels` | Каналы чата |
| `send_chat_message` | Отправить сообщение (DM или в канал) |

### Reports
| Tool | Описание |
|------|----------|
| `get_meeting_report` | Отчёт по встрече |
| `get_daily_usage_report` | Дневной отчёт использования |
| `get_meeting_participant_report` | Детальный отчёт по участникам |

### Phone & Settings
| Tool | Описание |
|------|----------|
| `list_phone_call_logs` | Журнал звонков Zoom Phone |
| `get_meeting_settings` | Настройки аккаунта |

## Настройка Zoom

1. [Zoom Marketplace](https://marketplace.zoom.us/) → Develop → Build App → **Server-to-Server OAuth**
2. Скопируй **Account ID**, **Client ID**, **Client Secret**
3. Scopes: `meeting:write:admin`, `meeting:read:admin`, `recording:read:admin`, `user:read:admin`, `webinar:write:admin`, `webinar:read:admin`, `chat_message:write`, `chat_channel:read`, `report:read:admin`, `phone:read:admin`
4. Activate

## Локальный запуск

```bash
export ZOOM_ACCOUNT_ID=...
export ZOOM_CLIENT_ID=...
export ZOOM_CLIENT_SECRET=...
npm install && npm run build && npm start
```

## Деплой на Railway

1. [Railway](https://railway.app/) → New Project → Deploy from GitHub
2. Выбери `alexmarud/zoommcp`
3. Добавь переменные: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`

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
