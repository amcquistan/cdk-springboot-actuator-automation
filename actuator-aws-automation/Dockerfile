# syntax=docker/dockerfile:experimental
FROM eclipse-temurin:11-jdk-alpine AS build
WORKDIR /workspace/app

COPY . .
RUN --mount=type=cache,target=/root/.gradle ./gradlew clean build -x test
RUN mkdir -p build/dependency && cp build/libs/*-SNAPSHOT.jar build/dependency/app.jar


FROM eclipse-temurin:11-jdk-alpine
VOLUME /tmp
RUN apk --no-cache add curl

ARG DEPENDENCY=/workspace/app/build/dependency
COPY --from=build /workspace/app/build/dependency/app.jar /app.jar

ENTRYPOINT ["java", "-jar", "./app.jar"]
