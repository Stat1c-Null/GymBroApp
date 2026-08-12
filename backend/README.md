# GymBroApp — backend

REST API на Spring Boot для GymBroApp: пользователи, библиотека упражнений,
недельные логи тренировок, вес тела, настройки и друзья.

Фронтенд (Angular, `../`) пока работает на Firebase и к этому API не подключён —
бэкенд поднимается и тестируется отдельно.

## Стек

| Что | Версия |
|---|---|
| Java | 17 |
| Spring Boot | 4.0.7 (`webmvc`, `data-jpa`, `security`, `validation`) |
| База | PostgreSQL (H2 в профиле `dev`) |
| Миграции | Liquibase, SQL-чейнджсеты в `src/main/resources/db/changelog` |
| Авторизация | JWT (HS256), stateless, `Authorization: Bearer <token>` |

## Как это устроено

```
src/main/java/com/gymbro/backend/
├── config/       SecurityConfig (фильтр-чейн, CORS, BCrypt), JwtProperties
├── security/     JwtService (выпуск/проверка токена), JwtAuthFilter, AuthenticatedUser
├── controller/   REST-эндпоинты, ничего не знают о JPA
├── service/      бизнес-логика и транзакции; проверка владения записью — здесь
├── repository/   Spring Data JPA
├── model/        JPA-сущности (без связей-коллекций: FK — обычные Long-поля)
├── dto/          record'ы запросов/ответов; наружу сущности не отдаются
└── exception/    ApiException + GlobalExceptionHandler (единый JSON ошибок)
```

Несколько решений, которые стоит знать:

- **Деньги/веса** хранятся как `NUMERIC` в фунтах (`*_lbs`) — как и в текущем
  приложении; килограммы считаются на выходе (`WeightResponse.kg`).
- **Библиотека ≠ лог.** `exercises` — что пользователь тренирует,
  `workout_entries` — что он сделал в конкретный день. В `workout_entries`
  имя и группа упражнения продублированы: лог не должен ломаться, если
  упражнение переименовали или удалили (поэтому `exercise_id` nullable +
  `ON DELETE SET NULL`).
- **Неделя** адресуется любой датой внутри неё и всегда приводится к понедельнику.
- **Удаление группы мышц** в настройках переносит её упражнения в `Unassigned`
  в той же транзакции, а не оставляет их висеть.
- **Дружба** — одна строка на пару (`user_low_id`/`user_high_id` уникальны),
  поэтому принятие заявки видно обеим сторонам сразу.

## Запуск

### 1. PostgreSQL

База `gymbro`, пользователь `postgres`/`postgres` (или свои значения через
переменные окружения из таблицы ниже). Если Postgres нет под рукой:

```bash
docker run --name gymbro-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gymbro \
  -p 5432:5432 -d postgres:16
```

### 2. Приложение

```bash
./mvnw spring-boot:run              # Windows: mvnw.cmd spring-boot:run
```

Схема создаётся Liquibase при старте (`ddl-auto: validate` — Hibernate только
проверяет, что сущности совпадают с миграциями).

### Без PostgreSQL

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

Профиль `dev` поднимает H2 в режиме совместимости с PostgreSQL, миграции
прогоняются те же самые. Удобно для проверки API, данные живут в памяти.

### Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/gymbro` | JDBC URL |
| `DB_USER` / `DB_PASSWORD` | `postgres` / `postgres` | доступ к БД |
| `JWT_SECRET` | dev-значение из `application.yml` | ключ HMAC, ≥ 32 байта. **Обязательно переопределить в проде** |
| `CORS_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` | origin'ы Angular-дев-сервера |
| `PORT` | `8080` | порт |

## API

Все эндпоинты под `/api`, кроме `register`/`login`, требуют
`Authorization: Bearer <token>`. Ошибки — единый JSON:
`{timestamp, status, error, message, details?}`.

### Авторизация

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/register` | `{email, username, password, displayName?}` → `{token, tokenType, expiresIn, user}` |
| POST | `/api/auth/login` | `{email, password}` → тот же ответ |
| GET | `/api/auth/me` | текущий пользователь |

### Упражнения (библиотека)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/exercises?muscleGroup=Chest` | список, фильтр необязателен |
| POST | `/api/exercises` | `{name, muscleGroup, usualWeightLbs?, maxWeightLbs?}` |
| PUT | `/api/exercises/{id}` | полная замена |
| DELETE | `/api/exercises/{id}` | 204 |

### Недели и записи

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/weeks?from=2026-09-01&to=2026-10-29` | без параметров — последние 8 недель, новые сверху |
| GET | `/api/weeks/{дата}` | неделя по любой дате внутри неё |
| POST | `/api/weeks/{дата}/entries` | добавить запись (неделя создаётся сама) |
| PUT | `/api/entries/{id}` | изменить запись (наборы заменяются целиком) |
| DELETE | `/api/entries/{id}` | удалить; пустая неделя удаляется следом |

Тело записи — либо силовое упражнение с подходами, либо кардио:

```jsonc
// силовое
{ "day": 0, "exerciseId": 1,
  "sets": [ {"reps": 5, "weightLbs": 185.0}, {"reps": 5, "weightLbs": 185.0, "timeSec": 40} ] }

// кардио
{ "day": 2, "exerciseName": "Running", "muscleGroup": "Cardio",
  "cardio": {"timeSec": 1800, "distanceMiles": 3.1, "heartRate": 145, "elevationFeet": 120} }
```

`exerciseName`/`muscleGroup` можно не передавать, если есть `exerciseId` —
тогда они копируются из библиотеки.

### Настройки

`GET /api/settings`, `PUT /api/settings` (полная замена):

```json
{ "showSetTime": false, "unit": "lbs", "distanceUnit": "mi",
  "muscleGroups": ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"],
  "weightGoal": {"startLbs": 190, "startDate": "2026-10-01", "targetLbs": 175, "targetDate": "2027-01-01"} }
```

### Вес тела

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/weights?limit=50` | история, новые сверху; в ответе `lbs` и `kg` |
| GET | `/api/weights/latest` | последнее взвешивание (404, если пусто) |
| POST | `/api/weights` | `{weightLbs, loggedAt?}` |
| DELETE | `/api/weights/{id}` | 204 |

### Друзья

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/users/search?q=ni&limit=20` | поиск по префиксу username/имени; пустой `q` — весь список |
| GET | `/api/friends` | `{friends, incoming, outgoing}` |
| POST | `/api/friends/requests` | `{userId}` — отправить заявку |
| POST | `/api/friends/requests/{id}/accept` | принять |
| POST | `/api/friends/requests/{id}/decline` | отклонить (204) |
| DELETE | `/api/friends/{id}` | удалить друга / отозвать заявку (204) |

В результатах поиска есть поле `relationship`: `self` | `friend` | `incoming` | `outgoing` | `none`.

## Пример

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"nick@example.com","username":"nick","password":"secret123"}' \
  | jq -r .token)

curl -s -X POST localhost:8080/api/exercises \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Bench Press","muscleGroup":"Chest","usualWeightLbs":180}'

curl -s localhost:8080/api/weeks/2026-10-29 -H "Authorization: Bearer $TOKEN"
```

## Тесты

```bash
./mvnw test
```

- `ApiFlowTest` — сквозной сценарий по HTTP: регистрация → логин → упражнение →
  запись в неделю → чтение → настройки (включая перенос группы в `Unassigned`) →
  401 без токена, 409 на дубликат, 400 на валидацию.
- `BackendApplicationTests` — контекст целиком: миграции + `ddl-auto: validate`.
- `JwtServiceTest`, `WeekServiceTest` — чистая логика.

Тесты гоняются на H2 в памяти, PostgreSQL для них не нужен.

## Что ещё не сделано

- **Перенос данных из Firestore** — отдельный скрипт (Firebase Admin SDK →
  PostgreSQL), пока его нет; схема выше повторяет форму документов, чтобы
  маппинг был прямым.
- **Google-вход** — сейчас только email/пароль; для Google нужен OAuth-клиент
  и его проверка на бэкенде.
- **Аналитика** (`/api/analytics/...`) — графики пока считает фронтенд;
  эндпоинты для агрегатов не добавлены.
- **Рефреш-токены** — токен живёт 12 часов и обновляется повторным логином.
