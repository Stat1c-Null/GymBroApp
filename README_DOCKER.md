# 🐳 GymBro — Запуск за 3 команды (инструкция для пещерного человека)

> **Цель:** Поднять базу данных + бэкенд одной командой. Никаких ручных миграций, никаких `mvn install`, никаких `java -jar`. Только Docker.

---

## 📋 Что нужно иметь

1. **Docker Desktop** — скачай с [docker.com](https://www.docker.com/products/docker-desktop/) → установи → запусти (кит в трее должен быть зеленый).
2. **Git** (опционально) — если клонируешь репозиторий.
3. **Терминал** (PowerShell / cmd / bash).

---

## 🚀 Запуск за 3 шага

### 1. Клонируй проект (если еще нет)
```bash
git clone <твой-репозиторий>
cd GymBroApp
```

### 2. Создай `.env` из примера и поставь пароли
```bash
# Windows (PowerShell):
Copy-Item .env.example .env
notepad .env

# Linux / Mac:
cp .env.example .env
nano .env
```

**Что обязательно заполнить в `.env`:**
```bash
POSTGRES_PASSWORD=super_secret_db_password_123
JWT_SECRET=твой_сгенерированный_ключ_минимум_32_байта
```

> **Как сгенерировать JWT_SECRET (один раз):**
> ```bash
> # В терминале:
> openssl rand -base64 48
> # Скопируй вывод в JWT_SECRET
> ```

### 3. Одной командой поднимаем всё
```bash
docker-compose up --build -d
```
- `--build` — соберет JAR внутри Docker (maven качает зависимости, компилирует, пакует)
- `-d` — в фоне (detached)

**Что происходит внутри:**
1. Docker скачивает образы `maven:3.9-eclipse-temurin-17` и `eclipse-temurin:17-jre-alpine`
2. Собирает твой проект внутри контейнера (не нужны maven/java на хосте!)
3. Поднимает PostgreSQL в контейнере `gymbro-db`
4. Ждет, пока база станет здоровой (`pg_isready`)
5. Поднимает бэкенд в контейнере `gymbro-api`
6. Liquibase автоматически накатит все миграции в базу
7. Приложение готово на `http://localhost:8080`

---

## ✅ Проверка: работает ли?

### 1. Health check (база + приложение)
```bash
curl http://localhost:8080/actuator/health
```
**Ожидаемый ответ:**
```json
{"status":"UP","components":{"db":{"status":"UP",...},"diskSpace":{"status":"UP",...},"ping":{"status":"UP"}}}
```

### 2. API доступен
```bash
curl http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer invalid"
# {"timestamp":"...","status":401,"error":"Unauthorized","message":"A valid bearer token is required"}
```
> 401 — это нормально, значит сервер жив и защищает эндпоинты.

### 3. Логи (если что-то не так)
```bash
# Все логи:
docker-compose logs -f

# Только бэкенд:
docker-compose logs -f backend

# Только база:
docker-compose logs -f postgres
```

---

## 🛑 Как выключить

```bash
# Остановить и удалить контейнеры (данные в volumes останутся):
docker-compose down

# Остановить И удалить ВСЁ (включая базу данных!):
docker-compose down -v
```
> `-v` удаляет `pgdata` volume → **все данные в базе пропадут навсегда**. Используй осторожно.

---

## 🔧 Полезные команды

| Что нужно | Команда |
|---|---|
| Пересобрать после изменений в коде | `docker-compose up --build -d` |
| Зайти в базу (psql) | `docker-compose exec postgres psql -U postgres -d gymbro` |
| Зайти в контейнер бэкенда (шелл) | `docker-compose exec backend sh` |
| Посмотреть статус контейнеров | `docker-compose ps` |
| Перезапустить только бэкенд | `docker-compose restart backend` |

---

## ❓ Частые проблемы

| Проблема | Решение |
|---|---|
| `Port 5432 already in use` | У тебя уже стоит локальный PostgreSQL. Останови его: `sudo systemctl stop postgresql` (Linux) или Services.msc → PostgreSQL → Stop (Windows). |
| `Port 8080 already in use` | Что-то уже висит на 8080. Либо останови, либо поменяй в `docker-compose.yml`: `"8081:8080"`. |
| `JWT_SECRET too short` | В `.env` должен быть ключ минимум 32 байта. Сгенерируй: `openssl rand -base64 48`. |
| Миграции не накатились | Проверь логи: `docker-compose logs backend | grep -i liquibase`. Обычно помогает `docker-compose down -v && docker-compose up --build -d` (чистая пересборка). |

---

## ❓ Ответы на твои вопросы

### 1. Почему `jdbc:postgresql://postgres:5432/gymbro`, а не `localhost`?

> **Потому что контейнеры в одной Docker-сети (`gymbro-network`).**  
> Внутри этой сети Docker создает **внутренний DNS**: имя сервиса (`postgres`) автоматически резолвится в IP контейнера базы.  
> `localhost` внутри контейнера бэкенда — это **сам контейнер бэкенда**, там базы нет.  
> А `postgres:5432` — это «обратись к контейнеру с именем `postgres` на порту 5432». Docker сам подставит правильный IP.

> **Аналогия:** В отеле ты звонишь на ресепшн не по номеру комнаты («localhost»), а набираешь «0» («postgres») — связь идет через внутреннюю сеть отеля.

---

### 2. Как проверить, что миграции Liquibase применились внутри контейнера?

**Вариант 1: Через логи (самый простой)**
```bash
docker-compose logs backend | grep -i liquibase
```
**Ожидаемый вывод:**
```
INFO  liquibase.changelog - Reading changelog from db/changelog/master.yml
INFO  liquibase.changelog - Running changelog db/changelog/001-users.sql
INFO  liquibase.changelog - ChangeSet db/changelog/001-users.sql::001-users::gymbro ran successfully in 45ms
...
INFO  liquibase.changelog - Running changelog db/changelog/008-versions-more.sql
INFO  liquibase.changelog - ChangeSet db/changelog/008-versions-more.sql::008-user-version::gymbro ran successfully in 12ms
INFO  liquibase.changelog - Successfully acquired change log lock
INFO  liquibase.changelog - Successfully released change log lock
```

**Если видишь `ran successfully` для всех чейнджсетов — миграции прошли.**

---

**Вариант 2: Прямой запрос к БД (таблица `databasechangelog`)**
```bash
# Зайди в psql внутри контейнера базы:
docker-compose exec postgres psql -U postgres -d gymbro -c "SELECT id, author, filename, dateexecuted, orderexecuted FROM databasechangelog ORDER BY dateexecuted;"
```
**Ожидаемый вывод:**
```
 id              | author |          filename          |        dateexecuted         | orderexecuted 
-----------------+--------+----------------------------+-----------------------------+---------------
 001-users       | gymbro | db/changelog/001-users.sql | 2026-11-07 19:15:23.123+00  |             1
 002-settings    | gymbro | db/changelog/002-s...      | 2026-11-07 19:15:23.456+00  |             2
 ...
 008-user-version| gymbro | db/changelog/008-...       | 2026-11-07 19:15:24.789+00  |             8
(8 rows)
```
> Если видишь 8 строк (или сколько у тебя чейнджсетов) — всё ок.

---

**Вариант 3: Прямой SQL запрос к таблицам**
```bash
docker-compose exec postgres psql -U postgres -d gymbro -c "\dt"
```
Должны быть таблицы: `users`, `exercises`, `workout_weeks`, `workout_entries`, `entry_sets`, `body_weights`, `user_settings`, `user_muscle_groups`, `friendships`, `databasechangelog`, `databasechangeloglock`.

---

## 🎯 Готово!

Теперь у тебя:
- ✅ PostgreSQL в изолированном контейнере
- ✅ Spring Boot приложение в контейнере
- ✅ Автоматические миграции Liquibase
- ✅ Health checks
- ✅ Данные базы сохраняются в volume `pgdata` (переживают рестарты)

**Запуск одной строкой:**
```bash
cp .env.example .env && nano .env  # поставь пароли
docker-compose up --build -d
curl http://localhost:8080/actuator/health
```

Работает? 🎉