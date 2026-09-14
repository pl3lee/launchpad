FROM node:24-alpine AS frontend
RUN corepack enable
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
COPY internal/server/icon-catalog.json /src/internal/server/icon-catalog.json
RUN pnpm test && pnpm run build

FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY go.mod main.go ./
COPY internal/ ./internal/
COPY --from=frontend /src/web/dist ./web/dist
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /launchpad .

FROM alpine:3.23
RUN addgroup -g 10001 launchpad && adduser -D -u 10001 -G launchpad launchpad \
    && mkdir /data && chown launchpad:launchpad /data
COPY --from=backend /launchpad /usr/local/bin/launchpad
USER launchpad
ENV LISTEN_ADDR=:8080 DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/launchpad"]
