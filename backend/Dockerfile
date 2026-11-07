# === Build stage ===
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Копируем только pom.xml → кэш зависимостей
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Копируем исходники и собираем
COPY src ./src
RUN mvn package -DskipTests -B

# === Runtime stage ===
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Non-root user для безопасности
RUN addgroup -g 1000 -S gymbro && adduser -u 1000 -S gymbro -G gymbro
USER gymbro:gymbro

# Копируем только jar из билд-стейджа
COPY --from=build /app/target/*.jar app.jar

# Health check для docker-compose
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]