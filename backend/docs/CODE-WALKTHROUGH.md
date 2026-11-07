# Разбор кода GymBroApp backend

Документ для тебя, а не для компилятора: что делает каждая часть, почему сделано
именно так и что произойдёт, если сделать иначе. Читать сверху вниз — порядок
совпадает с тем, как запрос проходит через приложение.

```
HTTP-запрос
   │
   ├─ SecurityFilterChain ──► JwtAuthFilter ──► JwtService.parse (кто ты?)
   │                                  │
   │                                  └─ нет/плохой токен → 401 (кроме /auth/register, /auth/login)
   ▼
DispatcherServlet ──► @RestController (controller/)
   │                        │  @Valid проверяет DTO
   ▼                        ▼
                service/ (@Transactional: одна транзакция на запрос)
                         │
                         ├─ repository/ (Spring Data JPA → SQL)
                         └─ model/ (JPA-сущности) ──► PostgreSQL
   │
   ▼
DTO (record) ──► Jackson ──► JSON
```

---

## 1. Каркас приложения

### `pom.xml`

Родитель `spring-boot-starter-parent:4.0.7` — не «библиотека», а набор версий
(«BOM»): он фиксирует совместимые версии Spring, Hibernate, Jackson, Tomcat и
т.д. Именно поэтому у зависимостей ниже не указаны `<version>` — иначе пришлось
бы вручную сводить десятки версий.

```xml
<properties>
    <java.version>17</java.version>   <!-- release=17 в компиляторе -->
</properties>
```

Почему 17, а не 25 (хотя на машине стоит 25): 17 — LTS и минимальная версия для
Spring Boot 4. Код собирается с `--release 17`, то есть случайно использовать
API из 21/25 не получится.

Зависимости и зачем каждая:

| Зависимость | Что даёт |
|---|---|
| `spring-boot-starter-webmvc` | встроенный Tomcat, DispatcherServlet, Jackson |
| `spring-boot-starter-data-jpa` | Hibernate + Spring Data + HikariCP |
| `spring-boot-starter-security` | фильтр-чейн, `PasswordEncoder`, контекст безопасности |
| `spring-boot-starter-validation` | `@Valid`, Hibernate Validator (JSR-380) |
| `spring-boot-starter-liquibase` | автоконфигурация Liquibase (**в Boot 4 отдельный стартер**) |
| `postgresql` (runtime) | JDBC-драйвер; `runtime` = не нужен при компиляции |
| `h2` (runtime) | база в памяти для профиля `dev` и тестов |
| `spring-boot-devtools` (runtime, optional) | перезапуск при изменении классов, не попадает в jar |

Две ловушки Boot 4, на которые я наступил при сборке:

1. **`liquibase-core` сам по себе больше не запускает миграции.** В Boot 4
   автоконфигурации разнесли по модулям (`spring-boot-liquibase`), и без
   стартера Liquibase просто не создаётся как бин. Симптом: `ddl-auto: validate`
   падает с «missing table», а в логах ни слова про Liquibase.
2. **Jackson 3.** Пакеты теперь `tools.jackson.databind.*`, а не
   `com.fasterxml.jackson.databind.*`. Старое API доступно только с модулем
   `spring-boot-jackson2`.

### `src/main/resources/application.yml`

```yaml
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/gymbro}
    username: ${DB_USER:postgres}
    password: ${DB_PASSWORD:postgres}
```

`${DB_URL:значение}` — «взять переменную окружения `DB_URL`, а если её нет —
взять значение после двоеточия». Так один и тот же jar запускается локально и на
сервере без пересборки.

```yaml
  jpa:
    hibernate:
      ddl-auto: validate      # Hibernate НЕ создаёт схему, только сверяет с ней
    open-in-view: false       # не держать EntityManager открытым во время рендера
```

`validate` — важное решение: схемой владеет Liquibase, Hibernate только
проверяет, что маппинг совпадает. Если сущность и миграция разъедутся, приложение
не стартует — это лучше, чем узнать о расхождении на проде через месяц.

`open-in-view: false` убирает «магию»: сессия Hibernate живёт ровно столько,
сколько длится транзакция сервиса. Ленивая загрузка за пределами сервиса падает
сразу, а не тихо работает в контроллере (и не держит соединение с БД, пока
клиент медленно читает JSON).

```yaml
  liquibase:
    enabled: true
    change-log: classpath:db/changelog/master.yml

app:
  jwt:
    secret: ${JWT_SECRET:gymbro-dev-secret-change-me-please-0123456789abcdef}
    ttl: PT12H                       # ISO-8601 Duration, биндится в java.time.Duration
  cors:
    allowed-origins: ${CORS_ORIGINS:http://localhost:4200,http://127.0.0.1:4200}
```

`PT12H` — формат `Duration.parse`, поэтому в `JwtProperties` поле имеет тип
`Duration`, а не `String`/`long`.

### `application-dev.yml`

```yaml
url: jdbc:h2:mem:gymbro_${random.uuid};MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;...
```

- `mem:` — база в памяти, умирает вместе с JVM;
- `MODE=PostgreSQL` — H2 включает совместимый синтаксис;
- `DATABASE_TO_LOWER=TRUE` — имена таблиц в нижнем регистре, как в Postgres
  (иначе Hibernate будет искать `USERS`, а Liquibase создаст `users`);
- `${random.uuid}` — **своя база на каждый Spring-контекст**. Без этого два
  тестовых контекста в одной JVM лезут в одну H2 и дерутся за служебную таблицу
  Liquibase `DATABASECHANGELOG`. Именно на этом падал `BackendApplicationTests`.

### `BackendApplication.java`

```java
@SpringBootApplication      // = @Configuration + @EnableAutoConfiguration + @ComponentScan
@ConfigurationPropertiesScan // находить @ConfigurationProperties в пакете
public class BackendApplication { ... }
```

`@ComponentScan` ищет бины в пакете `com.gymbro.backend` и ниже — поэтому все
классы лежат под ним. `@ConfigurationPropertiesScan` — чтобы `JwtProperties` не
приходилось регистрировать вручную через `@EnableConfigurationProperties`.

---

## 2. Миграции: `db/changelog/*.sql`

`master.yml` — просто список include'ов; Liquibase применяет их по порядку и
пишет в таблицу `DATABASECHANGELOG`, какие changeset'ы уже выполнены. Повторный
запуск ничего не пересоздаёт.

Каждый чейнджсет помечен `--changeset gymbro:001-users` — автор и id. Менять
содержимое уже применённого чейнджсета нельзя: Liquibase считает контрольную
сумму и упадёт. Новое изменение = новый чейнджсет.

```sql
CREATE TABLE users (
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ...
```

- `GENERATED BY DEFAULT AS IDENTITY` — стандартный SQL-синтаксис автоинкремента
  (вместо устаревшего `SERIAL`). `BY DEFAULT` разрешает вставить свой id,
  `ALWAYS` — запрещал бы; в тестах удобнее `BY DEFAULT`.
- `TIMESTAMP WITH TIME ZONE` ↔ `OffsetDateTime`: хранится момент времени с
  смещением, а не «локальные часы сервера».
- `NUMERIC(6,2)` ↔ `BigDecimal`: 6 цифр всего, 2 после запятой → до `9999.99`.
  Для весов этого хватает, а `double` для чисел с фиксированной точностью
  использовать нельзя (0.1 + 0.2 ≠ 0.3).
- `CONSTRAINT uq_users_email UNIQUE (email)` — ограничение на уровне БД, а не
  только проверка в коде. Проверка в коде гоняется с другими запросами
  (TOCTOU), уникальный индекс — нет.
- `ON DELETE CASCADE` — удалили пользователя, за ним ушли его тренировки,
  подходы, веса. Именно то, о чём S писал в переписке.
- `ON DELETE SET NULL` у `workout_entries.exercise_id` — обратный случай:
  упражнение из библиотеки удалили, но запись в истории должна остаться.
- `CHECK (day_of_week BETWEEN 0 AND 6)` — «день недели» не может быть 9.
  Валидация в DTO ловит это в API, CHECK — на случай скрипта миграции.

Почему колонка называется `day_of_week`, а не `day`: `DAY` — зарезервированное
слово в H2 (и функция `EXTRACT(DAY ...)` в SQL). С `day` миграция падала с
`Syntax error ... expected "identifier"`.

`user_low_id` / `user_high_id` в `friendships` — те же два id, отсортированные по
возрастанию, только чтобы навесить `UNIQUE (user_low_id, user_high_id)`. Почему не
`UNIQUE (requester_id, addressee_id)`: тогда A→B и B→A — две разные пары, и можно
завести двух «друзей» дважды. Почему не `UNIQUE (LEAST(a,b), GREATEST(a,b))`:
индекс по выражению есть в Postgres, но H2 его не понимает, а тесты должны
работать на обеих базах.

---

## 3. Безопасность

### `config/JwtProperties.java`

```java
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration ttl) {

    public JwtProperties {                       // компактный конструктор record
        if (secret == null || secret.getBytes(UTF_8).length < 32) {
            throw new IllegalArgumentException(...);
        }
        ...
    }
}
```

Record здесь уместен: объект неизменяемый, живёт всё приложение, создаётся
один раз Spring'ом из конфига. Компактный конструктор — единственное место, где
можно проверить инварианты, и он вызывается при каждом создании.

Почему минимум 32 байта: HMAC-SHA256 требует ключ не короче длины хэша.
`Keys.hmacShaKeyFor` в библиотеках обычно кидает исключение на коротком ключе;
у нас проверка своя, чтобы упасть с понятным сообщением на старте, а не в момент
первого логина.

### `security/JwtService.java`

Тут три вещи: как устроен JWT, как он подписывается и как проверяется.

**Формат JWT** — три сегмента через точку: `header.payload.signature`, каждый в
base64url (без `+`, `/` и `=`).

```java
private static final String HEADER = base64Url(
        "{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(UTF_8));
```

Заголовок постоянный, поэтому считается один раз при загрузке класса.

```java
public String issue(Long userId, String email, String username) {
    long issuedAt = Instant.now().getEpochSecond();
    Map<String, Object> claims = new LinkedHashMap<>();
    claims.put("sub", String.valueOf(userId));   // subject — стандартное поле JWT
    claims.put("email", email);
    claims.put("username", username);
    claims.put("iat", issuedAt);                 // issued at
    claims.put("exp", issuedAt + ttlSeconds);    // expiration

    String signingInput = HEADER + "." + base64Url(json.writeValueAsBytes(claims));
    return signingInput + "." + base64Url(sign(signingInput));
}
```

Ключевая идея: **подписывается не токен целиком, а первые два сегмента**
(`header.payload`). Подпись — HMAC-SHA256 от этой строки с секретным ключом.
Клиент видит все claims (они не зашифрованы!), но не может их изменить: любая
правка payload ломает подпись.

```java
private byte[] sign(String signingInput) {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(key);
    return mac.doFinal(signingInput.getBytes(UTF_8));
}
```

`Mac` создаётся на каждый вызов — это не расточительность, а потокобезопасность:
`Mac` не потокобезопасен, а `JwtService` — singleton, который вызывают
одновременно из разных потоков Tomcat. Локальная переменная = у каждого потока
свой экземпляр. `SecretKeySpec` неизменяем, его можно шарить.

```java
if (!MessageDigest.isEqual(expected, actual)) throw new InvalidTokenException(...);
```

`MessageDigest.isEqual` сравнивает побайтово **за постоянное время**. Обычный
`Arrays.equals` выходит на первом несовпадении, и по времени ответа можно
подбирать подпись (timing attack).

```java
long expiresAt = payload.path("exp").asLong(0L);
if (expiresAt <= Instant.now().getEpochSecond()) throw new InvalidTokenException("Token expired");
```

`path(...)` вместо `get(...)`: `get` вернёт `null` для отсутствующего поля и
придётся проверять, `path` вернёт «пустой» узел, у которого `asLong(0)` даст 0.
Токен без `exp` сразу считается просроченным (0 < now) — безопасное поведение по
умолчанию.

Чего здесь **нет** и почему: нет проверки `alg` из заголовка. Классическая
уязвимость — подсунуть `alg: none` или `HS256` вместо `RS256`; у нас алгоритм
зашит в код, заголовок вообще не читается, поэтому атака невозможна by design.
Минус: токен с другим `alg` формально пройдёт проверку подписи, но подписать его
без секрета всё равно нельзя.

### `security/JwtAuthFilter.java`

Наследуется от `OncePerRequestFilter` — Spring гарантирует один вызов на запрос
(даже при внутренних forward'ах).

```java
if (header != null && header.startsWith(BEARER_PREFIX)
        && SecurityContextHolder.getContext().getAuthentication() == null) {
```

Третье условие — не перетирать уже установленную аутентификацию.

```java
var authentication = new UsernamePasswordAuthenticationToken(user, null, List.of());
authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
SecurityContextHolder.getContext().setAuthentication(authentication);
```

`Authentication` — это «кто» (principal = `AuthenticatedUser`), «чем доказал»
(credentials = null, пароль уже не нужен) и «что можно» (authorities = пусто:
ролей в приложении нет). Дальше `SecurityContextHolder` — это ThreadLocal, то
есть контекст виден только текущему потоку; в контроллере его достаёт
`@AuthenticationPrincipal`.

```java
} catch (InvalidTokenException | IllegalArgumentException ex) {
    SecurityContextHolder.clearContext();   // остаёмся анонимом
}
```

Фильтр не отвечает 401 сам: он лишь говорит «токен плохой». Решение «пускать или
нет» принимает `authorizeHttpRequests`, а 401 пишет entry point. Так публичные
эндпоинты (`/auth/login`) работают даже со старым токеном в заголовке.

### `config/SecurityConfig.java`

```java
.csrf(AbstractHttpConfigurer::disable)
```
CSRF-атака работает на cookie-аутентификации: браузер сам приложит cookie к
запросу с чужого сайта. У нас токен в заголовке `Authorization`, браузер его
автоматически не прикладывает → CSRF не применим. Отключаем осознанно.

```java
.sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
```
`HttpSession` не создаётся вовсе: каждый запрос несёт токен, сервер ничего не
помнит между запросами. Это и есть смысл «stateless» — можно ставить несколько
инстансов за балансировщиком без sticky sessions.

```java
.authorizeHttpRequests(auth -> auth
        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
        .requestMatchers("/error", "/actuator/health").permitAll()
        .anyRequest().authenticated())
```
Правила применяются сверху вниз, первое совпадение выигрывает. `permitAll` только
для двух POST-ов — важно, что метод указан: `GET /api/auth/login` останется
закрытым.

```java
.authenticationEntryPoint((request, response, ex) -> {
    response.setStatus(401);
    response.setContentType("application/json");
    response.getWriter().write("{\"status\":401,...}");
})
```
Без этого Spring отдал бы пустой 403 или редирект на форму логина. Теперь все
ошибки — единый JSON.

```java
@Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
```
BCrypt: соль внутри хэша, адаптивная сложность (по умолчанию 10 раундов ≈ 60-100 мс
на проверку), поэтому брутфорс дорогой. Хэш нельзя «расшифровать» — только
сравнить.

CORS: браузер разрешает `localhost:4200` → `localhost:8080`, только если сервер
явно ответил заголовками `Access-Control-Allow-*`. `allowedMethods` включает
`OPTIONS` — предварительный запрос браузера.

---

## 4. Модель (`model/`)

### Как Hibernate превращает класс в таблицу

```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
```

- `@Entity` — класс управляется Hibernate, у него есть `@Id`;
- `IDENTITY` — id генерирует БД (`IDENTITY`-колонка), Hibernate вставляет строку,
  не указывая id, и читает сгенерированное значение;
- `@Column(nullable = false, unique = true, length = 255)` — только для генерации
  DDL/валидации. Так как `ddl-auto: validate`, реальные ограничения всё равно
  берутся из миграций; аннотации нужны, чтобы validate не ругался.

Имена колонок: Spring Boot по умолчанию включает `CamelCaseToUnderscoresNamingStrategy`,
поэтому `usualWeightLbs` → `usual_weight_lbs` автоматически. Там, где имя
неочевидно, стоит явное `@Column(name = ...)`.

### `@CreationTimestamp` / `@UpdateTimestamp`

```java
@CreationTimestamp
@Column(name = "created_at", nullable = false, updatable = false)
private OffsetDateTime createdAt;
```

Hibernate сам ставит время при INSERT/UPDATE, без `@PrePersist`. `updatable = false`
запрещает перезапись при UPDATE. Время серверное, а не клиентское — клиент не
может подделать дату создания.

### Почему нет `@ManyToOne` / `@OneToMany`

Это самое важное архитектурное решение, и оно спорит с учебниками.

Классический вариант: `WorkoutEntry { @ManyToOne WorkoutWeek week; }` и
`WorkoutWeek { @OneToMany List<WorkoutEntry> entries; }`. Проблемы, которые
появляются сразу:

1. **N+1**: загрузили 10 недель, у каждой ленивый список → 11 запросов.
2. **`MultipleBagFetchException`**: две `List` (entries и sets) нельзя тянуть
   одним `join fetch`.
3. **Ленивые прокси в JSON**: сериализация вне транзакции → `LazyInitializationException`
   или утечка всего графа в ответ.
4. **Каскады**: `CascadeType.ALL` + `orphanRemoval` в этой модели означают, что
   случайное `save` может удалить данные.

Здесь вместо этого — обычные `Long weekId`, `Long entryId` и явные запросы:
`findByWeekIdIn`, `findByEntryIdIn`. Плюсы: запросы видно в коде, их количество
известно (ровно 3 на список недель), нет прокси, DTO собирается вручную. Минусы:
нельзя написать `week.getEntries()` и «поехали»; целостность внутри приложения
держим сами, а на уровне БД её держат FK.

Такой подход (иногда называют «JPA без графа объектов») — нормальный выбор для
API-приложений, где важны предсказуемые запросы. В проектах, где модель активно
используется в памяти, связи оправданы.

### Неизменяемость и «анемичная модель»

Сущности — обычные Java-bean'ы с геттерами/сеттерами (Hibernate требует
no-arg конструктор и доступ к полям). Бизнес-логики в них почти нет — это
«анемичная модель», и это нормально, когда логика живёт в сервисах. Плюс: легко
маппить, минус: инварианты проверяются в сервисах, а не в самих объектах.

Где инварианты всё же в модели:
- `Friendship.STATUS_PENDING` / `STATUS_ACCEPTED` — константы вместо строкового
  литерала в десяти местах;
- `WorkoutEntry.isCardio()` — вычисляемый признак, а не отдельное поле, которое
  может разъехаться с данными;
- `EntrySet(userId, index, ...)` — конструктор, который не даёт создать подход
  без позиции.

### Конкретные типы

| Поле | Тип | Почему |
|---|---|---|
| `day` | `short` | 0..6, в БД `SMALLINT` (2 байта вместо 4) |
| `weightLbs` | `BigDecimal` | деньги/веса — только точная арифметика |
| `loggedAt` | `OffsetDateTime` | момент времени с зоной |
| `weekStart` | `LocalDate` | дата без времени |
| `userId` в `UserSettings` | `Long` как `@Id` | id настройек **и есть** id пользователя |

`UserSettings` без `@GeneratedValue` — это «assigned id»: ключ задаётся вручную,
и он же внешний ключ на `users`. Так невозможно создать настройки «ни для кого»
(если бы id генерировался, а `user_id` был отдельной колонкой, теоретически можно).

---

## 5. Репозитории (`repository/`)

Spring Data JPA генерирует реализацию из интерфейса. Ни одного `implements` —
все методы строятся из имени или из `@Query`.

### Derived queries: как парсится имя

```java
Optional<User> findByEmailIgnoreCase(String email);
```

Разбор: `findBy` + свойство `email` + `IgnoreCase`. SQL:
`select ... from users where lower(email) = lower(?)`. Обрати внимание: `email`
в БД хранится в нижнем регистре (`AuthService.normalizeEmail`), но
`IgnoreCase` делает запрос устойчивым к данным, записанным руками.

```java
List<Exercise> findByUserIdAndMuscleGroupOrderByNameAsc(Long userId, String muscleGroup);
```
`And` → два условия, `OrderByNameAsc` → `order by name asc`. Это работает, пока
имя остаётся читаемым; при 4+ условиях лучше явный `@Query`.

### `@Query` там, где имени мало

```java
@Query("""
        select u from User u
        where u.id <> :userId
          and (lower(u.username) like lower(concat(:term, '%'))
               or lower(coalesce(u.displayName, '')) like lower(concat(:term, '%')))
        order by lower(u.username)
        """)
List<User> searchByPrefix(@Param("userId") Long userId, @Param("term") String term, Pageable pageable);
```

Это **JPQL**, не SQL: `User` и `username` — имена сущностей и полей, а не таблиц
и колонок. Плюс: при переименовании колонки запрос не ломается. `concat(:term, '%')`
— поиск по префиксу; `coalesce(...,'')` — чтобы `null` в `display_name` не
обнулял всё условие (`boolean` в SQL — трёхзначная логика).

Подвох с `like`: символы `%` и `_` в поисковой строке пользователя станут
wildcard'ами. Здесь это не критично (это поиск по своим данным, не SQL-инъекция),
но в проде `%` обычно экранируют.

Владение записью:

```java
@Query("""
        select e from WorkoutEntry e
        join WorkoutWeek w on w.id = e.weekId
        where e.id = :entryId and w.userId = :userId
        """)
Optional<WorkoutEntry> findOwned(@Param("entryId") Long entryId, @Param("userId") Long userId);
```

`join` по полю-идентификатору (`on w.id = e.weekId`) — это **entity join**;
Hibernate 6+ его поддерживает. Смысл: одна проверка вместо двух запросов, и
чужой entry физически не вернётся. Это защита от IDOR (Insecure Direct Object
Reference) — когда злоумышленник подставляет чужой id.

### `@Modifying`

```java
@Modifying
@Query("update Exercise e set e.muscleGroup = :to where e.userId = :userId and e.muscleGroup = :from")
int reassignMuscleGroup(...);
```

`UPDATE`/`DELETE` через `@Query` обязан быть `@Modifying`, иначе Spring Data
попытается выполнить его как `select`. Возвращает `int` — сколько строк
затронуто. Требует активной транзакции (`@Transactional` на сервисе).

**Тонкость, которую часто ловят на ревью:** после такого UPDATE в
`EntityManager` остаются старые версии сущностей. Если в той же транзакции их
прочитать, Hibernate может отдать кэшированные значения. Лечится
`@Modifying(clearAutomatically = true, flushAutomatically = true)`. У нас это
безопасно, потому что после `reassignMuscleGroup` мы не читаем `Exercise` в той
же транзакции — но знать про это надо.

### `flush()` в `deleteBy...`

```java
void deleteByUserId(Long userId);   // derived delete: select + delete по одной
```

Derived delete сначала загружает сущности, потом удаляет их — не одним `DELETE
WHERE`. Hibernate выполняет действия в порядке **insert → update → delete**, то
есть при «удали все группы и вставь новые» новые INSERT'ы уйдут раньше DELETE'ов
и упрутся в `UNIQUE (user_id, name)`. Поэтому в `SettingsService.replaceGroups`
стоит `flush()` между удалением и вставкой. Это же правило действует в
`WeekService.updateEntry` при замене подходов.

### `Pageable`

```java
List<BodyWeight> findByUserIdOrderByLoggedAtDesc(Long userId, Pageable pageable);
```

`Pageable` можно добавлять последним параметром к любому derived-методу; Spring
подставит `limit/offset`. Возвращать `List` можно — тогда не будет второго
`count`-запроса, который нужен для `Page<T>`. Для «последних 50 взвешиваний»
count не нужен.

---

## 6. DTO (`dto/`)

### Почему record

```java
public record UserResponse(Long id, String email, String username, String displayName,
        OffsetDateTime createdAt) {
    public static UserResponse from(User user) { ... }
}
```

Record даёт: `private final` поля, конструктор, геттеры (`id()`, а не `getId()`),
`equals/hashCode/toString` — и всё это неизменяемо. DTO не должен меняться после
создания: он описывает снимок данных для ответа.

Геттеры в Jackson 3 работают с record'ами нативно — `id()` сериализуется как
`"id"`.

### Разделение Request/Response

`ExerciseRequest` (вход) и `ExerciseResponse` (выход) — разные классы, хотя поля
похожи. Причины:
- валидация нужна только на входе;
- в ответе есть `id` и `createdAt`, которых нет во входе;
- если завтра вход и выход разойдутся (например, `id` нельзя менять), менять
  один класс, а не ломать контракт.

### Валидация

```java
public record RegisterRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 3, max = 50) @Pattern(regexp = "[A-Za-z0-9._-]+") String username,
        @NotBlank @Size(min = 8, max = 72) String password,
        @Size(max = 100) String displayName) { }
```

- `@NotBlank` — не null и не одни пробелы (`@NotNull` пропустил бы `"   "`);
- `@Size(max = 72)` у пароля — ограничение BCrypt: он использует первые 72 байта,
  всё дальше молча игнорируется. Если не ограничить, пользователь думает, что
  пароль длиннее, чем реально проверяется;
- `@Valid` ставится в контроллере на `@RequestBody`; без него аннотации в DTO —
  просто декорация. Вложенные объекты валидируются только с `@Valid` на поле
  (см. `List<SetDto> sets`).

### Вложенные record'ы

```java
public record SettingsResponse(..., WeightGoal weightGoal) {
    public record WeightGoal(BigDecimal startLbs, LocalDate startDate, ...) { }
}
```

`WeightGoal` существует только в контексте настроек — вложенность показывает это
и не плодит файл `WeightGoalDto.java` в общем пакете. Ссылка в коде:
`SettingsResponse.WeightGoal`.

### Статические фабрики

```java
public static ExerciseResponse from(Exercise exercise) { ... }
```

Маппинг «сущность → DTO» лежит рядом с DTO: одно место, где меняется форма ответа.
Альтернативы — отдельный `Mapper`-класс (лучше для сложных маппингов) или
MapStruct (генерация кода). Для 10 DTO ручные фабрики читаются проще. Минус:
DTO начинает знать про сущность (пакет `dto` зависит от `model`). Это направление
зависимости нормально (внешний слой знает про внутренний), но в строгом
«гексагоне» маппер вынесли бы наружу.

---

## 7. Сервисы (`service/`) — где живёт логика

### Транзакции

```java
@Transactional
public AuthResponse register(RegisterRequest request) { ... }
```

`@Transactional` на публичном методе = Spring создаёт прокси, который открывает
транзакцию до входа в метод и коммитит после возврата (или откатывает при
`RuntimeException`). Важно: **работает только через прокси**, поэтому вызов
`this.method()` внутри того же класса транзакцию не откроет.

`@Transactional(readOnly = true)` — подсказка: Hibernate не делает dirty
checking (не сравнивает все загруженные сущности на предмет изменений) и не
флашит. Чуть быстрее и честнее по смыслу. На PostgreSQL это ещё и
`readOnly`-транзакция.

`open-in-view: false` + транзакция в сервисе = вся работа с сущностями
происходит внутри транзакции, наружу уходят уже готовые DTO. Поэтому в
контроллерах нет ни одного `entityManager`.

### `AuthService`

```java
if (userRepository.existsByEmailIgnoreCase(email)) throw ApiException.conflict(...);
```

Проверка «до», а не «на» — чтобы вернуть 409 с понятным сообщением, а не 500 из
`DataIntegrityViolationException`. Но между проверкой и вставкой есть окно
гонки: два параллельных запроса с одним email. Спасает уникальный индекс в БД —
второй INSERT упадёт, `GlobalExceptionHandler` превратит это в 409. То есть
проверка — для UX, constraint — для корректности. Классическая схема «defense in
depth».

```java
user.setPasswordHash(passwordEncoder.encode(request.password()));
```
Хэширование до сохранения; в БД никогда не попадает пароль. `BCryptPasswordEncoder.matches`
при логине сам вытащит соль из хэша.

```java
throw ApiException.unauthorized("Invalid email or password");
```

Одна и та же ошибка для «нет такого email» и «неверный пароль» — иначе можно
перебором узнать, какие email зарегистрированы (user enumeration).

### `SettingsService.replaceGroups` — самый интересный метод

```java
List<String> previous = readGroups(userId);
Set<String> removed = new LinkedHashSet<>(previous);
removed.removeAll(cleaned);
removed.remove(UNASSIGNED_GROUP);
for (String group : removed) {
    exerciseRepository.reassignMuscleGroup(userId, group, UNASSIGNED_GROUP);
}
muscleGroupRepository.deleteByUserId(userId);
muscleGroupRepository.flush();
writeGroups(userId, cleaned);
```

Логика в три шага, и порядок важен:
1. вычислить, какие группы исчезли;
2. **сначала** перевесить упражнения из исчезнувших групп — пока их имена ещё
   есть в старой таблице (если сделать наоборот, придётся угадывать);
3. заменить список групп.

`removed.remove(UNASSIGNED_GROUP)` — страховка: если пользователь удалил все
группы и ему пришлось бы перевешивать в `Unassigned` упражнения, которые уже
там, — лишний UPDATE. А `clean()` запрещает называть свою группу `Unassigned`,
потому что это зарезервированный бакет.

`flush()` — см. раздел про репозитории: без него INSERT'ы новых групп уйдут
раньше DELETE'ов старых и упрутся в уникальный индекс. Именно на этом падал
`ApiFlowTest` с 409.

### `WeekService`

```java
public static LocalDate mondayOf(LocalDate date) {
    return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
}
```

`previousOrSame` — если дата уже понедельник, остаётся собой. Клиент может
прислать любую дату недели, сервер нормализует: `/api/weeks/2026-10-29` и
`/api/weeks/2026-10-26` — один и тот же ресурс.

`get()` возвращает **пустую неделю**, а не 404, если недели ещё нет. Это
осознанно: для клиента «неделя без тренировок» — нормальное состояние, а не
ошибка; страница рисует пустую сетку.

```java
private Map<Long, List<EntryResponse>> entryMap(List<Long> weekIds) {
    List<WorkoutEntry> entries = entryRepository.findByWeekIdInOrderByDayAscIdAsc(weekIds);
    ...
    setRepository.findByEntryIdInOrderByEntryIdAscSetIndexAsc(entryIds)
```

Вот как решается N+1 без графа объектов: ровно **3 запроса** на любое количество
недель (недели → записи → подходы), потом склейка в памяти через `LinkedHashMap`.
Классическая альтернатива — join fetch, но с двумя коллекциями он упирается в
`MultipleBagFetchException`.

```java
public EntryResponse updateEntry(...) {
    applyToEntry(userId, entry, request);
    entryRepository.save(entry);
    setRepository.deleteByEntryId(entry.getId());
    setRepository.flush();          // иначе INSERT раньше DELETE
    saveSets(entry.getId(), request);
}
```

Подходы при редактировании **заменяются целиком**, а не мержатся по индексу. Это
простое и предсказуемое правило: клиент присылает полный список, сервер
перезаписывает. Если бы мы мержили, пришлось бы решать, что делать с подходами,
которых клиент не прислал (удалить? оставить?), — и появлялись бы «фантомные»
подходы.

```java
entryRepository.delete(entry);
entryRepository.flush();
if (entryRepository.countByWeekId(weekId) == 0) {
    weekRepository.findById(weekId).ifPresent(weekRepository::delete);
}
```

Неделя — контейнер, у которого нет собственного смысла: пустая неделя в БД —
мусор, который ломает «список недель». Поэтому удаляется автоматически.
`flush()` перед `countByWeekId` обязателен: без него count увидит ещё не
удалённую строку и вернёт 1.

```java
if (request.cardio() != null && request.sets() != null && !request.sets().isEmpty()) {
    throw ApiException.badRequest("... either strength or cardio, not both");
}
```

Бизнес-правило «или подходы, или кардио» — в одном месте, а не размазано по
контроллеру и БД. В базе это можно было бы выразить CHECK-ом, но лучше отдать
проверку сервису: сообщение об ошибке получается понятным для пользователя.

```java
if (exerciseId != null) {
    Exercise libraryExercise = exerciseRepository.findByIdAndUserId(exerciseId, userId)
            .orElseThrow(() -> ApiException.badRequest("exerciseId does not belong to you"));
```

Тут сразу две вещи: проверка существования и проверка владения. `findById` без
`userId` позволил бы сослаться на чужое упражнение — это была бы утечка (можно
узнать название чужого упражнения по его id).

### `WeightService`

```java
int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
```

Клиент присылает `limit` — всегда ограничиваем сверху (500), иначе
`?limit=1000000` вытащит всю таблицу и положит сервер. Это «защита от
самострела», стандартная практика для любого API с параметром размера страницы.

```java
BigDecimal kg = lbs.divide(LBS_PER_KG, 1, RoundingMode.HALF_UP);
```

В БД храним одно значение (фунты), второе считаем. В Firestore хранились оба —
это источник расхождений: можно записать `kg`, забыв `lbs`, и данные разъедутся.
Вычисление на чтении всегда согласовано.

### `FriendService`

```java
long low = Math.min(userId, targetUserId);
long high = Math.max(userId, targetUserId);
if (friendshipRepository.findByUserLowIdAndUserHighId(low, high).isPresent()) {
    throw ApiException.conflict("You already have a relationship with this user");
}
```

«Уже есть связь» проверяется по **неупорядоченной** паре: и A→B, и B→A дают
`(low, high)`. Без этого можно было отправить заявку дважды навстречу друг другу.

```java
private Friendship requireParticipant(Long userId, Long friendshipId) {
    Friendship friendship = friendshipRepository.findById(friendshipId)
            .orElseThrow(() -> ApiException.notFound("Friendship not found"));
    if (!requester.equals(userId) && !addressee.equals(userId)) {
        throw ApiException.notFound("Friendship not found");   // тот же ответ
    }
```

Почему не 403: 403 подтверждает, что объект существует. 404 для чужой записи —
стандартная практика, чтобы нельзя было перебором id узнать, сколько записей в
системе.

```java
if (Friendship.STATUS_PENDING.equals(friendship.getStatus())
        && !friendship.getRequesterId().equals(userId)) {
    throw ApiException.forbidden("Decline this request instead of removing it");
}
```

Смысловое разделение: заявку можно **отклонить** (ты адресат) или **отозвать**
(ты автор). Одна ручка `DELETE` не должна позволять адресату «удалить» заявку в
обход статуса — иначе история отношений теряется.

---

## 8. Контроллеры

```java
@RestController                 // @Controller + @ResponseBody: возвращаемое = тело ответа
@RequestMapping("/api/exercises")
public class ExerciseController {

    @GetMapping
    public List<ExerciseResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) String muscleGroup) { ... }
```

- `@AuthenticationPrincipal` достаёт principal из `SecurityContext` — тот самый
  `AuthenticatedUser`, который положил фильтр. Контроллеру не нужно знать про
  JWT.
- `@RequestParam(required = false)` → параметр может отсутствовать; Spring
  передаст `null`, сервис решит, что делать.
- `@PathVariable Long id` → конвертация строки в `Long`; невалидное значение даст
  400 (обрабатывается `MethodArgumentTypeMismatchException`).
- `@ResponseStatus(HttpStatus.CREATED)` на методе — вместо `ResponseEntity`, когда
  тело и так возвращается.
- `void` + `@ResponseStatus(NO_CONTENT)` для DELETE — 204 без тела, как в REST.

```java
@GetMapping("/weeks/{date}")
public WeekResponse get(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
```

`@DateTimeFormat` обязателен: без него Spring не знает, как парсить дату
(хотя ISO-формат он угадывает, явное указание — контракт).

Контроллеры намеренно «тонкие»: ни одного `if` про бизнес-правила, только
маппинг HTTP ↔ вызов сервиса. Это не формальность: всё, что проверяется в
контроллере, невозможно переиспользовать (например, из планировщика или другого
сервиса) и сложно протестировать без HTTP.

---

## 9. Ошибки

### `ApiException`

```java
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    public static ApiException notFound(String message) { return new ApiException(NOT_FOUND, message); }
```

Наследуемся от `RuntimeException`, а не `Exception`:
- `@Transactional` откатывается **только на unchecked** исключениях (по
  умолчанию). Checked пришлось бы объявлять в каждом методе и оборачивать;
- сигнатуры не засоряются `throws`.

Статические фабрики вместо конструктора с `HttpStatus` — читаемее
`throw ApiException.notFound("...")` и не даёт перепутать порядок аргументов.
`status` — `HttpStatus` из Spring, потому что исключение всё равно живёт в
веб-слое.

### `GlobalExceptionHandler`

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex) {
        return build(ex.getStatus(), ex.getMessage(), null);
    }
```

`@RestControllerAdvice` ловит исключения из **всех** контроллеров. Порядок
хендлеров: Spring выбирает самый специфичный класс (по иерархии), поэтому
`ApiException` не попадёт в `Exception`.

```java
@ExceptionHandler(MethodArgumentNotValidException.class)
public ResponseEntity<...> handleValidation(...) {
    Map<String, String> fields = new LinkedHashMap<>();
    ex.getBindingResult().getFieldErrors().forEach(error -> fields.putIfAbsent(
            error.getField(), error.getDefaultMessage()));
```

Ошибки `@Valid` приходят не по одной: собираем «поле → сообщение», причём
`putIfAbsent` оставляет **первое** сообщение для поля (обычно самое точное:
«должно быть email», а не «не null»).

```java
body.put("timestamp", OffsetDateTime.now());
```

Единый формат ошибки для всего API — клиенту не нужно угадывать: то же самое
пишет entry point безопасности. Мелочь, но на фронте экономит кучу `if`.

```java
@ExceptionHandler(DataIntegrityViolationException.class)
... return build(HttpStatus.CONFLICT, "That would break a database constraint ...");
```

Последний рубеж: гонки, которые прошли мимо проверок в коде. 500 здесь был бы
неправильным кодом — клиент-то сделал «недопустимое», а не сервер сломался.

```java
@ExceptionHandler(Exception.class)
public ... handleUnexpected(Exception ex) {
    log.error("Unhandled error", ex);      // стектрейс — в лог
    return build(INTERNAL_SERVER_ERROR, "Something went wrong on our side", null);  // наружу — ничего
```

Важно, что наружу не уходит `ex.getMessage()`: в тексте исключения могут быть
SQL-фрагменты, имена таблиц и данных. Логируем детально, отвечаем общо.

---

## 10. Тесты

### `JwtServiceTest`

Обычный unit-тест без Spring: `new JwtService(new JwtProperties(...))`. Быстро
(0.7 с) и проверяет именно криптографию: round-trip claims, подделанный payload,
мусор вместо токена, истёкший токен (`ttl = 500 мс`, `sleep(700)`).

Почему не мокаем: мокать `JwtService` в тесте `JwtService` бессмысленно — нужно
проверить реальную подпись.

### `WeekServiceTest`

Только статический метод `mondayOf` — четыре границы: обычный день, сам
понедельник, переход через месяц, воскресенье как последний день недели. Такие
тесты дешёвые и ловят офф-бай-один в календарной логике (самый частый баг в
любом «недельном» приложении).

### `BackendApplicationTests`

```java
@SpringBootTest
@ActiveProfiles("dev")
class BackendApplicationTests { @Test void contextLoads() { } }
```

«Пустой» тест, который на самом деле проверяет много: весь граф бинов
собирается, Liquibase накатывает миграции с нуля, Hibernate проходит `validate`.
Это самый дешёвый способ поймать «на проде не стартует».

### `ApiFlowTest`

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
```

`RANDOM_PORT` поднимает настоящий Tomcat на свободном порту. Запросы идут через
JDK `HttpClient`, а не через MockMvc — это важно: MockMvc **не проходит** через
фильтр-цепочку сервера целиком и не проверяет реальные коды ответа так, как их
увидит браузер. Здесь проверяется всё: сериализация, security-фильтр, CORS-заголовки,
статусы.

Почему порт берётся так:

```java
@Value("${local.server.port}") int port;
```

`local.server.port` появляется только после старта сервера — это стандартный
контракт Spring Boot.

Почему нет `@Transactional` на тесте: HTTP-запросы выполняются в других потоках
и других транзакциях, тестовая транзакция их не откатит. Поэтому каждый тест
регистрирует **уникальный** email, а не полагается на откат.

Что покрыто:
- регистрация → токен → `/me`;
- 401 без токена (реальная проверка, что security не «забыли закрыть»);
- создание упражнения и записи с двумя подходами;
- нормализация даты (`/weeks/2026-10-27` → `weekStart: 2026-10-26`);
- пустая неделя приходит с `entries: []`, а не 404;
- редактирование (подходы заменяются), удаление (неделя исчезает);
- вес: `180 lbs` → `81.6 kg`;
- удаление группы мышц → упражнение уходит в `Unassigned`, **а лог сохраняет
  старую группу** (проверка денормализации);
- 409 на повторную регистрацию, 401 на неверный пароль, 400 с читаемым телом
  на невалидные поля.

---

## 11. Полный путь одного запроса

`POST /api/weeks/2026-10-29/entries` с токеном:

1. **Tomcat** принимает соединение, отдаёт в фильтр-цепочку.
2. **`JwtAuthFilter`** видит `Authorization: Bearer ...`, вызывает
   `JwtService.parse`, получает `AuthenticatedUser(1, "a@b.c", "nick")`, кладёт в
   `SecurityContext`.
3. **`authorizeHttpRequests`** проверяет: путь не в белом списке, а
   `authentication != null` → пропускает.
4. **DispatcherServlet** ищет обработчик: `WeekController.addEntry`, конвертирует
   `2026-10-29` в `LocalDate`, читает тело в `EntryRequest`, прогоняет `@Valid`.
5. **`WeekService.addEntry`** открывает транзакцию:
   - `mondayOf(2026-10-29)` → `2026-10-26`;
   - ищет неделю, если нет — `INSERT` (уникальный индекс защищает от гонки);
   - проверяет `exerciseId` (принадлежит ли пользователю), достаёт из библиотеки
     имя и группу;
   - `INSERT` записи, затем `INSERT` подходов;
   - собирает `EntryResponse` (ещё один `SELECT` подходов).
6. Транзакция коммитится → `200/201` с JSON.
7. Если что-то бросило `ApiException` — `GlobalExceptionHandler` превращает в
   JSON с нужным статусом; `@Transactional` откатывает всё, что успели записать.

Дальше — `STANDARDS-AUDIT.md`: что из этого соответствует «среднему» уровню
Java-бэкендера, а что нет и как исправлять.
